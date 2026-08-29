const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

// 게시글/댓글 텍스트에서 http(s) URL을 클릭 가능한 링크로 변환
export default function Linkify({ text }) {
  if (!text) return null;
  return String(text).split(URL_REGEX).map((part, i) => (
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: '#6C8EFF', wordBreak: 'break-all', textDecoration: 'underline' }}
      >
        {part}
      </a>
    ) : part
  ));
}
