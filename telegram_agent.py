#!/usr/bin/env python3
"""
DayMate Telegram Agent — 텔레그램으로 Claude에게 개발/앱 명령을 내리는 에이전트

기능:
  - 텍스트 명령 → Claude가 파일 읽기/수정/bash 실행
  - 이미지 전송 → Claude가 화면 보고 구현
  - 대화 히스토리 유지 (/clear 로 초기화)
  - git push 후 Vercel 배포 완료 알림

실행: python3 telegram_agent.py
환경변수는 .env.local 에서 자동으로 읽습니다.
"""

import asyncio
import base64
import glob
import io
import json
import os
import subprocess
import urllib.request
from pathlib import Path

import anthropic
from telegram import Update
from telegram.ext import (
    Application, CommandHandler, ContextTypes,
    MessageHandler, filters,
)

# ── 환경변수 로드 (.env.local) ────────────────────────────────
BASE_DIR = Path(__file__).parent
ENV_FILE = BASE_DIR / ".env.local"

def load_env(path: Path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"'))

load_env(ENV_FILE)

# ── 설정 ─────────────────────────────────────────────────────
PROJECT_DIR     = str(BASE_DIR)
TELEGRAM_TOKEN  = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_CHAT_ID = int(os.environ.get("TELEGRAM_CHAT_ID", "0"))
ANTHROPIC_KEY   = os.environ.get("ANTHROPIC_API_KEY", "")

# Vercel 배포 알림
VERCEL_TOKEN      = "vca_33VWnhr5LdUDHhuPzso6BUAS0cHeuYBOtu5r4vmg95QH0728HZ4UhYVJ"
VERCEL_PROJECT_ID = "prj_EdnIiBAcUzI7iQs8U8hUQpJ0Am7I"
VERCEL_TEAM_ID    = "team_Z4aVNtPPS5X7HOf16wd0tPEg"

client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

# ── 대화 히스토리 ─────────────────────────────────────────────
# {chat_id: [{"role": "user"/"assistant", "content": ...}]}
conversation_history: dict[int, list] = {}
MAX_HISTORY = 30  # 메시지 최대 보관 수


def get_history(chat_id: int) -> list:
    return conversation_history.setdefault(chat_id, [])


def add_to_history(chat_id: int, role: str, content):
    history = get_history(chat_id)
    history.append({"role": role, "content": content})
    # 오래된 메시지 제거 (MAX_HISTORY 초과 시)
    if len(history) > MAX_HISTORY:
        conversation_history[chat_id] = history[-MAX_HISTORY:]


# ── Claude 도구 정의 ──────────────────────────────────────────
TOOLS = [
    {
        "name": "read_file",
        "description": "프로젝트 파일 읽기",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "프로젝트 루트 기준 상대 경로"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "파일 생성 또는 덮어쓰기",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "bash",
        "description": "프로젝트 디렉토리에서 셸 명령 실행 (git, npm 등)",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"}
            },
            "required": ["command"],
        },
    },
    {
        "name": "list_files",
        "description": "프로젝트 파일 목록 조회",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "glob 패턴 (기본: src/**/*.*)"}
            },
        },
    },
]


def execute_tool(name: str, inputs: dict) -> tuple[str, bool]:
    """도구 실행. (결과, git_push_여부) 반환"""
    git_pushed = False

    if name == "read_file":
        path = os.path.join(PROJECT_DIR, inputs["path"])
        with open(path, "r", encoding="utf-8") as f:
            return f.read(), False

    elif name == "write_file":
        path = os.path.join(PROJECT_DIR, inputs["path"])
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(inputs["content"])
        return f"저장 완료: {inputs['path']}", False

    elif name == "bash":
        command = inputs["command"]
        git_pushed = "git push" in command
        result = subprocess.run(
            command,
            shell=True,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )
        out = (result.stdout + result.stderr).strip()
        return (out[:3000] if out else "(출력 없음)"), git_pushed

    elif name == "list_files":
        pattern = inputs.get("pattern", "src/**/*.*")
        files = glob.glob(os.path.join(PROJECT_DIR, pattern), recursive=True)
        files = [os.path.relpath(f, PROJECT_DIR) for f in sorted(files) if os.path.isfile(f)]
        return "\n".join(files[:100]) or "(없음)", False

    return "알 수 없는 도구", False


SYSTEM_PROMPT = f"""You are a coding assistant for the DayMate project running on Windows.
Project directory: {PROJECT_DIR}

## 프로젝트 구조
- React + Vite 프론트엔드 (src/)
- Vercel Serverless 함수 (api/)
- Firebase Firestore (데이터 저장)
- 배포: Vercel (git push → 자동 배포)

## 주요 파일
- src/screens/ : 각 화면 컴포넌트 (Today, Stats, Chat, Settings 등)
- src/components/ : 공유 컴포넌트
- src/styles.js : 전체 스타일
- api/ : 서버리스 함수 (telegram-webhook, notify, chat 등)
- src/firebase.js : Firebase 클라이언트

## 작업 순서
1. 관련 파일을 read_file로 먼저 읽어 확인
2. write_file로 수정
3. bash로 git add / commit / push
4. 결과를 한국어로 간결하게 보고

## git push 명령
git add -A && git commit -m "feat: <내용>" && git push origin main

한국어로 간결하게 응답하세요.
이미지가 첨부된 경우, 이미지를 분석하여 요청된 UI/기능을 구현하세요.
"""


# ── Vercel 배포 모니터링 ──────────────────────────────────────
async def monitor_deployment(bot, chat_id: int):
    """git push 후 Vercel 배포 상태를 폴링하여 완료/실패 알림"""
    await asyncio.sleep(10)  # 배포 시작 대기

    url = (
        f"https://api.vercel.com/v6/deployments"
        f"?projectId={VERCEL_PROJECT_ID}&teamId={VERCEL_TEAM_ID}&limit=1"
    )
    headers = {"Authorization": f"Bearer {VERCEL_TOKEN}"}

    for _ in range(36):  # 최대 3분 (5초 × 36)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            deployments = data.get("deployments", [])
            if not deployments:
                await asyncio.sleep(5)
                continue

            dep = deployments[0]
            state = dep.get("state", "")

            if state == "READY":
                await bot.send_message(
                    chat_id,
                    f"✅ 배포 완료!\n🌐 https://daymate-beta.vercel.app"
                )
                return
            elif state == "ERROR":
                await bot.send_message(chat_id, "❌ 배포 실패. Vercel 대시보드를 확인하세요.")
                return
        except Exception:
            pass

        await asyncio.sleep(5)

    await bot.send_message(chat_id, "⏱ 배포 확인 시간 초과. Vercel 대시보드를 직접 확인하세요.")


# ── 공통 Claude 실행 로직 ─────────────────────────────────────
async def run_claude(update: Update, context: ContextTypes.DEFAULT_TYPE, user_content):
    chat_id = update.effective_chat.id
    await update.message.reply_text("⏳ 처리 중...")

    # 최신 코드 자동 pull
    try:
        subprocess.run(["git", "pull", "origin", "main"], cwd=PROJECT_DIR, capture_output=True)
    except Exception:
        pass

    add_to_history(chat_id, "user", user_content)
    messages = list(get_history(chat_id))

    git_pushed = False

    try:
        for _ in range(20):
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=8096,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )

            for block in response.content:
                if block.type == "text" and block.text.strip():
                    text = block.text
                    for i in range(0, len(text), 4000):
                        await update.message.reply_text(text[i:i+4000])

            if response.stop_reason == "end_turn":
                add_to_history(chat_id, "assistant", response.content)
                break

            tool_calls = [b for b in response.content if b.type == "tool_use"]
            if not tool_calls:
                add_to_history(chat_id, "assistant", response.content)
                break

            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for tc in tool_calls:
                preview = str(tc.input)[:80]
                await update.message.reply_text(f"🔧 `{tc.name}` — `{preview}`", parse_mode="Markdown")
                try:
                    result, pushed = execute_tool(tc.name, tc.input)
                    if pushed:
                        git_pushed = True
                except Exception as e:
                    result = f"오류: {e}"
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": result,
                })

            tool_results_msg = {"role": "user", "content": tool_results}
            messages.append(tool_results_msg)

        # 히스토리 마지막 상태 동기화
        conversation_history[chat_id] = messages

        # git push 됐으면 배포 모니터링 시작
        if git_pushed:
            await update.message.reply_text("🚀 배포 중... 완료되면 알려드릴게요.")
            asyncio.create_task(monitor_deployment(context.bot, chat_id))

    except Exception as e:
        await update.message.reply_text(f"❌ 오류: {e}")


# ── 핸들러 ────────────────────────────────────────────────────
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if ALLOWED_CHAT_ID and chat_id != ALLOWED_CHAT_ID:
        await update.message.reply_text(f"⛔ 접근 거부.")
        return

    user_content = update.message.text
    await run_claude(update, context, user_content)


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if ALLOWED_CHAT_ID and chat_id != ALLOWED_CHAT_ID:
        await update.message.reply_text(f"⛔ 접근 거부.")
        return

    # 가장 큰 해상도 사진 다운로드
    photo = update.message.photo[-1]
    file = await context.bot.get_file(photo.file_id)
    buf = io.BytesIO()
    await file.download_to_memory(buf)
    image_b64 = base64.b64encode(buf.getvalue()).decode()

    caption = update.message.caption or "이 화면을 참고해서 구현해줘"

    user_content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": image_b64,
            },
        },
        {"type": "text", "text": caption},
    ]

    await run_claude(update, context, user_content)


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    conversation_history.pop(chat_id, None)
    await update.message.reply_text("🗑 대화 히스토리를 초기화했습니다.")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        f"🚀 DayMate 에이전트 준비 완료\n\n"
        f"예시:\n"
        f"• 오늘 화면 버튼 색 파란색으로 바꿔줘\n"
        f"• 설정 화면에 다크모드 추가해줘\n"
        f"• [사진 첨부] 이렇게 만들어줘\n\n"
        f"명령어:\n"
        f"/clear — 대화 히스토리 초기화",
        parse_mode="Markdown",
    )


# ── 메인 ─────────────────────────────────────────────────────
def main():
    if not TELEGRAM_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN이 없습니다.")
        return
    if not ANTHROPIC_KEY:
        print("❌ ANTHROPIC_API_KEY가 없습니다.")
        return

    print(f"✅ DayMate 에이전트 시작")
    print(f"   프로젝트: {PROJECT_DIR}")
    print(f"   허가된 Chat ID: {ALLOWED_CHAT_ID}")

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("clear", cmd_clear))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling()


if __name__ == "__main__":
    main()
