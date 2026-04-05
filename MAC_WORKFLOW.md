# Mac Workflow

이 파일은 Mac이 DayMate 텔레그램 개발 봇의 기본 호스트일 때 쓰는 빠른 운영 메모다.

## One Command

Mac에서는 이것만 기억하면 된다.

```bash
npm run tg:mac:update
```

이 한 줄이 아래 순서를 자동으로 실행한다.

1. 텔레그램 봇 중지
2. `git pull origin main`
3. 가상환경 활성화
4. `pip install -r requirements.txt`
5. 텔레그램 봇 다시 시작

## Status / Logs

상태 확인:

```bash
npm run tg:mac:status
```

로그 확인:

```bash
npm run tg:mac:logs
```

## Important Rule

- Mac과 Windows에서 텔레그램 개발 봇을 동시에 켜지 않는다.
- Mac에서 LaunchAgent가 봇을 관리 중이면 `pkill` 대신 아래 명령을 쓴다.

```bash
npm run tg:mac:stop
npm run tg:mac:start
```

## If Something Breaks

1. `npm run tg:mac:status` 로 상태 확인
2. `npm run tg:mac:logs` 로 최근 로그 확인
3. 필요하면 `npm run tg:mac:restart`
4. 코드가 최신이 아니면 `npm run tg:mac:update`

## LaunchAgent Note

- LaunchAgent 템플릿: `scripts/com.daymate.telegram-agent.plist.template`
- LaunchAgent가 KeepAlive 중이면 수동 종료만으로는 봇이 다시 살아날 수 있다.
- 이 경우 `launchctl` 기반 제어가 포함된 `npm run tg:mac:stop` / `npm run tg:mac:start` 를 사용한다.