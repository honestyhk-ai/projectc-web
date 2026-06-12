import { useState } from "react";

// 티어 아이콘(public/grades/{icon}.png) + 라벨. 공식 GradeIcon 미러.
export default function GradeBadge({
  icon,
  text,
  size = 22,
  showText = true,
}: {
  icon: number | null;
  text: string;
  size?: number;
  showText?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grade-badge" title={text}>
      {icon != null && !failed ? (
        <img
          className="grade-img"
          src={`${import.meta.env.BASE_URL}grades/${icon}.png`}
          width={size}
          height={size}
          alt={text}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}
      {showText && <span className="grade-text">{text}</span>}
    </span>
  );
}
