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
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

# Windows 콘솔 UTF-8 인코딩 설정
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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
VERCEL_TOKEN      = os.environ.get("VERCEL_TOKEN", "")
VERCEL_PROJECT_ID = os.environ.get("VERCEL_PROJECT_ID", "")
VERCEL_TEAM_ID    = os.environ.get("VERCEL_TEAM_ID", "")

client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

# ── 대화 히스토리 ─────────────────────────────────────────────
# {chat_id: [{"role": "user"/"assistant", "content": ...}]}
conversation_history: dict[int, list] = {}
MAX_HISTORY = 12  # 메시지 최대 보관 수
MAX_HISTORY_CHARS = 24000
MAX_TOOL_RESULT_CHARS = {
    "read_file": 12000,
    "bash": 4000,
    "list_files": 4000,
    "search_files": 4000,
    "replace_in_file": 1200,
    "write_file": 1000,
}


def get_history(chat_id: int) -> list:
    return conversation_history.setdefault(chat_id, [])


def truncate_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return text[:limit] + f"\n\n...[생략 {omitted}자]"


def normalize_history_content(content) -> str:
    if isinstance(content, str):
        return truncate_text(content, 2000)

    if isinstance(content, list):
        parts = []
        for block in content:
            block_type = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
            if block_type == "text":
                text = block.get("text", "") if isinstance(block, dict) else getattr(block, "text", "")
                if text:
                    parts.append(truncate_text(text, 1000))
            elif block_type == "tool_use":
                name = block.get("name", "tool") if isinstance(block, dict) else getattr(block, "name", "tool")
                tool_input = block.get("input", {}) if isinstance(block, dict) else getattr(block, "input", {})
                parts.append(f"[tool:{name}] {truncate_text(json.dumps(tool_input, ensure_ascii=False), 300)}")
            elif block_type == "tool_result":
                tool_result = block.get("content", "") if isinstance(block, dict) else getattr(block, "content", "")
                parts.append(f"[tool_result] {truncate_text(str(tool_result), 300)}")
            elif block_type == "image":
                parts.append("[image]")
        return truncate_text("\n".join(parts) or "(빈 내용)", 4000)

    return truncate_text(str(content), 2000)


def trim_history(history: list) -> list:
    trimmed = history[-MAX_HISTORY:]
    while len("\n".join(msg["content"] for msg in trimmed)) > MAX_HISTORY_CHARS and len(trimmed) > 2:
        trimmed = trimmed[2:]
    return trimmed


def add_to_history(chat_id: int, role: str, content):
    history = get_history(chat_id)
    history.append({"role": role, "content": normalize_history_content(content)})
    conversation_history[chat_id] = trim_history(history)


def compact_tool_result(name: str, result: str) -> str:
    limit = MAX_TOOL_RESULT_CHARS.get(name, 2000)
    return truncate_text(result, limit)


def is_context_overflow_error(error: Exception) -> bool:
    text = str(error).lower()
    return (
        "prompt is too long" in text
        or "context" in text and "long" in text
        or "maximum context length" in text
        or "too many input tokens" in text
    )


# ── Claude 도구 정의 ──────────────────────────────────────────
TOOLS = [
    {
        "name": "read_file",
        "description": "프로젝트 파일 일부 읽기. 큰 파일은 필요한 줄 범위만 읽습니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "프로젝트 루트 기준 상대 경로"},
                "start_line": {"type": "integer", "description": "시작 줄 번호(1부터). 생략 시 1"},
                "end_line": {"type": "integer", "description": "끝 줄 번호(포함). 생략 시 start_line+199"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_files",
        "description": "프로젝트 전체에서 텍스트를 검색합니다. 먼저 검색하고 필요한 파일 일부만 읽을 때 사용합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "검색할 텍스트 또는 정규식"},
                "glob": {"type": "string", "description": "대상 glob 패턴(예: src/**/*.jsx)"},
                "is_regex": {"type": "boolean", "description": "정규식 여부"}
            },
            "required": ["query"],
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
        "name": "append_file",
        "description": "기존 파일 끝에 텍스트를 덧붙입니다. 작업 로그나 위키 업데이트에 사용합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "replace_in_file",
        "description": "파일의 특정 텍스트를 정확히 찾아 부분 수정합니다. 작은 수정은 write_file보다 이 도구를 우선 사용합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old_text": {"type": "string", "description": "정확히 일치해야 하는 기존 텍스트"},
                "new_text": {"type": "string", "description": "교체할 새 텍스트"},
                "expected_count": {"type": "integer", "description": "기대 일치 횟수. 기본값 1"}
            },
            "required": ["path", "old_text", "new_text"],
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
        start_line = max(1, int(inputs.get("start_line", 1)))
        end_line = int(inputs.get("end_line", start_line + 199))
        if end_line < start_line:
            end_line = start_line

        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        total = len(lines)
        start_idx = min(start_line - 1, total)
        end_idx = min(end_line, total)
        selected = lines[start_idx:end_idx]
        numbered = "".join(f"{i:>4}: {line}" for i, line in enumerate(selected, start=start_idx + 1))
        header = f"# {inputs['path']} ({start_idx + 1}-{end_idx}/{total})\n"
        return header + (numbered or "(빈 범위)"), False

    elif name == "search_files":
        query = inputs["query"]
        glob_pattern = inputs.get("glob", "**/*")
        is_regex = bool(inputs.get("is_regex", False))
        compiled = re.compile(query, re.IGNORECASE) if is_regex else None
        matches = []

        for file_path in glob.glob(os.path.join(PROJECT_DIR, glob_pattern), recursive=True):
            if not os.path.isfile(file_path):
                continue
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    for line_no, line in enumerate(f, start=1):
                        hit = compiled.search(line) if compiled else query.lower() in line.lower()
                        if hit:
                            rel = os.path.relpath(file_path, PROJECT_DIR)
                            matches.append(f"{rel}:{line_no}: {line.rstrip()}")
                            if len(matches) >= 60:
                                break
                if len(matches) >= 60:
                    break
            except Exception:
                continue

        return "\n".join(matches) or "(검색 결과 없음)", False

    elif name == "write_file":
        path = os.path.join(PROJECT_DIR, inputs["path"])
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(inputs["content"])
        return f"저장 완료: {inputs['path']}", False

    elif name == "append_file":
        path = os.path.join(PROJECT_DIR, inputs["path"])
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
          f.write(inputs["content"])
        return f"추가 완료: {inputs['path']}", False

    elif name == "replace_in_file":
        path = os.path.join(PROJECT_DIR, inputs["path"])
        expected_count = max(1, int(inputs.get("expected_count", 1)))
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        old_text = inputs["old_text"]
        new_text = inputs["new_text"]
        occurrences = content.count(old_text)
        if occurrences != expected_count:
            return (
                f"교체 실패: {inputs['path']} 에서 일치 횟수 {occurrences}회 (기대값 {expected_count}회)",
                False,
            )

        updated = content.replace(old_text, new_text, expected_count)
        with open(path, "w", encoding="utf-8") as f:
            f.write(updated)
        return f"부분 수정 완료: {inputs['path']} ({expected_count}곳)", False

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


SYSTEM_PROMPT = f"""You are a coding assistant for the DayMate project running on the current local machine.
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
- AI_WIKI/ : AI 전용 프로젝트 위키

## AI_WIKI 우선 문서
- AI_WIKI/README.md
- AI_WIKI/overview.md
- AI_WIKI/frontend.md
- AI_WIKI/ops.md
- AI_WIKI/telegram.md
- AI_WIKI/decisions.md
- AI_WIKI/known-issues.md
- AI_WIKI/update-log.md

## 작업 순서
1. 먼저 AI_WIKI 관련 문서를 읽어 현재 프로젝트 문맥을 파악한다.
2. list_files 또는 search_files로 위치를 좁힌다.
3. read_file은 필요한 줄 범위만 읽는다 (한 번에 최대 200줄 정도).
4. write_file/replace_in_file/append_file로 수정한다.
5. 큰 작업을 끝냈으면 AI_WIKI/update-log.md와 관련 위키 문서를 짧게 갱신한다.
6. bash로 git add / commit / push.
7. 결과를 한국어로 간결하게 보고한다.

## 실행 환경 규칙
- 현재 OS나 셸을 단정하지 않는다.
- OS/셸 차이가 중요하면 bash로 먼저 확인한 뒤 그 결과를 기준으로 행동한다.
- 경로와 명령은 실제 확인된 환경에 맞춰 사용한다.

## 컨텍스트 절약 규칙
- 큰 파일 전체를 read_file로 읽지 말고 start_line, end_line을 꼭 사용한다.
- 먼저 search_files로 함수명/컴포넌트명을 찾은 뒤 필요한 구간만 읽는다.
- bash 출력이 길면 핵심만 요약해서 다음 행동을 결정한다.
- 정보가 부족하면 파일 전체를 읽기보다 추가 구간을 다시 읽는다.

## 위키 갱신 규칙
- 기능, 배포, 운영, 버그 수정처럼 후속 세션에 도움이 되는 작업이면 AI_WIKI를 갱신한다.
- `AI_WIKI/update-log.md`에는 짧게 append 한다.
- 반복 버그, 운영 규칙, 결정 이유는 관련 문서(`ops.md`, `telegram.md`, `decisions.md`, `known-issues.md`)에도 반영한다.
- 민감한 값은 적지 않는다.

## git push 명령
git add -A && git commit -m "feat: <내용>" && git push origin main

한국어로 간결하게 응답하세요.
이미지가 첨부된 경우, 이미지를 분석하여 요청된 UI/기능을 구현하세요.
"""


# ── Vercel 배포 모니터링 ──────────────────────────────────────
async def monitor_deployment(bot, chat_id: int):
    """git push 후 Vercel 배포 상태를 폴링하여 완료/실패 알림"""
    if not VERCEL_TOKEN or not VERCEL_PROJECT_ID:
        await bot.send_message(
            chat_id,
            "ℹ️ Vercel 배포 모니터링을 건너뜁니다. VERCEL_TOKEN, VERCEL_PROJECT_ID 환경변수를 설정하면 자동 확인할 수 있습니다.",
        )
        return

    await asyncio.sleep(10)  # 배포 시작 대기

    url = f"https://api.vercel.com/v6/deployments?projectId={VERCEL_PROJECT_ID}&limit=1"
    if VERCEL_TEAM_ID:
        url += f"&teamId={VERCEL_TEAM_ID}"
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
    retried_with_trimmed_history = False

    try:
        for _ in range(20):
            try:
                response = client.messages.create(
                    model="claude-opus-4-6",
                    max_tokens=8096,
                    system=SYSTEM_PROMPT,
                    tools=TOOLS,
                    messages=messages,
                )
            except Exception as e:
                if is_context_overflow_error(e) and not retried_with_trimmed_history:
                    retried_with_trimmed_history = True
                    messages = messages[-1:]
                    conversation_history[chat_id] = list(messages)
                    await update.message.reply_text("히스토리가 너무 길어서 최근 요청만 남기고 다시 시도합니다.")
                    response = client.messages.create(
                        model="claude-opus-4-6",
                        max_tokens=8096,
                        system=SYSTEM_PROMPT,
                        tools=TOOLS,
                        messages=messages,
                    )
                else:
                    raise

            for block in response.content:
                if block.type == "text" and block.text.strip():
                    text = block.text
                    for i in range(0, len(text), 4000):
                        await update.message.reply_text(text[i:i+4000])

            if response.stop_reason == "end_turn":
                final_text = "\n".join(
                    block.text.strip() for block in response.content
                    if block.type == "text" and block.text.strip()
                )
                add_to_history(chat_id, "assistant", final_text or response.content)
                break

            tool_calls = [b for b in response.content if b.type == "tool_use"]
            if not tool_calls:
                final_text = "\n".join(
                    block.text.strip() for block in response.content
                    if block.type == "text" and block.text.strip()
                )
                add_to_history(chat_id, "assistant", final_text or response.content)
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
                    "content": compact_tool_result(tc.name, result),
                })

            tool_results_msg = {"role": "user", "content": tool_results}
            messages.append(tool_results_msg)

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


def run_local_command(args: list[str]) -> str:
    try:
        result = subprocess.run(
            args,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        output = (result.stdout or result.stderr or "").strip()
        return output or "(없음)"
    except Exception as error:
        return f"오류: {error}"


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if ALLOWED_CHAT_ID and chat_id != ALLOWED_CHAT_ID:
        await update.message.reply_text("⛔ 접근 거부.")
        return

    branch = run_local_command(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    commit = run_local_command(["git", "rev-parse", "--short", "HEAD"])
    dirty = run_local_command(["git", "status", "--short"])
    history_count = len(get_history(chat_id))
    vercel_ready = "예" if VERCEL_TOKEN and VERCEL_PROJECT_ID else "아니오"

    message = "\n".join([
        "📍 DayMate Telegram Agent 상태",
        f"브랜치: {branch}",
        f"커밋: {commit}",
        f"작업 디렉토리: {PROJECT_DIR}",
        f"Python: {sys.executable}",
        f"대화 히스토리: {history_count}개",
        f"Vercel 모니터링 설정: {vercel_ready}",
        f"git 변경사항: {truncate_text(dirty if dirty != '(없음)' else '깨끗함', 1200)}",
    ])
    await update.message.reply_text(message)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        f"🚀 DayMate 에이전트 준비 완료\n\n"
        f"예시:\n"
        f"• 오늘 화면 버튼 색 파란색으로 바꿔줘\n"
        f"• 설정 화면에 다크모드 추가해줘\n"
        f"• [사진 첨부] 이렇게 만들어줘\n\n"
        f"명령어:\n"
        f"/clear — 대화 히스토리 초기화\n"
        f"/status — 현재 브랜치, 커밋, 변경사항 확인",
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
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling()


if __name__ == "__main__":
    main()
