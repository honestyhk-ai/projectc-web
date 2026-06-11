import { useState } from "react";

// 영웅 초상화. public/heroes/{heroNo}.png 를 로드, 없으면 번호로 폴백.
// (원본 도구의 imgs/{heroNo}.png 파일들을 public/heroes/ 에 넣으면 자동 표시됨)
export default function Hero({ no, size = 28 }: { no: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!no) return <span className="hero-num">-</span>;
  if (failed) return <span className="hero-num" title={`영웅 ${no}`}>{no}</span>;
  const src = `${import.meta.env.BASE_URL}heroes/${no}.png`;
  return (
    <img
      className="hero-img"
      src={src}
      width={size}
      height={size}
      alt={`영웅 ${no}`}
      title={`영웅 ${no}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
