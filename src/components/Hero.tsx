import { useState } from "react";
import { heroName } from "../lib/heroNames";

// 영웅 초상화. public/heroes/{heroNo}.png 를 로드, 없으면 번호로 폴백.
// 툴팁/alt 는 영웅 이름(매핑 없으면 "영웅 {번호}").
export default function Hero({ no, size = 28 }: { no: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!no) return <span className="hero-num">-</span>;
  const name = heroName(no);
  const label = name && name !== no ? name : `영웅 ${no}`;
  if (failed) return <span className="hero-num" title={label}>{no}</span>;
  const src = `${import.meta.env.BASE_URL}heroes/${no}.png`;
  return (
    <img
      className="hero-img"
      src={src}
      width={size}
      height={size}
      alt={label}
      title={label}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
