import { externalLinkClick, trimUrl } from "./links.js";

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

// 게시글/댓글 텍스트에서 http(s) URL을 클릭 가능한 링크로 변환
// linkColor: 파란 배경(내 채팅 말풍선 등)에서는 흰색처럼 바꿔 쓴다
// 주소 끝 문장부호·짝 없는 ")"는 링크에서 빼고 글자로 둔다 — "(https://a.com)"이 "a.com)"로 열리던 문제
export default function Linkify({ text, linkColor = '#6C8EFF' }) {
  if (!text) return null;
  return String(text).split(URL_REGEX).map((part, i) => {
    if (i % 2 === 0) return part;
    const url = trimUrl(part);
    const rest = part.slice(url.length);
    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={externalLinkClick(url)}
          style={{ color: linkColor, wordBreak: 'break-all', textDecoration: 'underline' }}
        >
          {url}
        </a>
        {rest}
      </span>
    );
  });
}
