const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

// 게시글/댓글 텍스트에서 http(s) URL을 클릭 가능한 링크로 변환
// linkColor: 파란 배경(내 채팅 말풍선 등)에서는 흰색처럼 바꿔 쓴다
export default function Linkify({ text, linkColor = '#6C8EFF' }) {
  if (!text) return null;
  return String(text).split(URL_REGEX).map((part, i) => (
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: linkColor, wordBreak: 'break-all', textDecoration: 'underline' }}
      >
        {part}
      </a>
    ) : part
  ));
}
