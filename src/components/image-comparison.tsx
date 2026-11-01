"use client";

import { useState, type CSSProperties } from "react";
import { MoveHorizontal } from "lucide-react";
import { Photo } from "./ui";
import styles from "./image-comparison.module.css";

export function ImageComparison({
  sourceUrl,
  previewUrl,
  sourceAlt,
  previewAlt,
  aspectRatio = 2 / 3,
}: {
  sourceUrl: string;
  previewUrl: string;
  sourceAlt: string;
  previewAlt: string;
  aspectRatio?: number;
}) {
  const [position, setPosition] = useState(50);
  const [sourceDimensions, setSourceDimensions] = useState<{
    url: string;
    ratio: number;
  } | null>(null);
  const ratio =
    sourceDimensions && sourceDimensions.url === sourceUrl
      ? sourceDimensions.ratio
      : aspectRatio;
  return (
    <div
      className={styles.comparison}
      style={
        {
          aspectRatio: ratio,
          "--photo-ratio": ratio,
          "--comparison-position": `${position}%`,
        } as CSSProperties
      }
    >
      <Photo
        original
        priority
        src={sourceUrl}
        alt={sourceAlt}
        onDimensions={({ width, height }) =>
          setSourceDimensions({
            url: sourceUrl,
            ratio: width / height,
          })
        }
      />
      <div className={styles.preview}>
        <Photo original priority src={previewUrl} alt={previewAlt} />
      </div>
      <div className={styles.divider} aria-hidden="true">
        <span>
          <MoveHorizontal size={18} />
        </span>
      </div>
      <input
        className={styles.range}
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label="Compare source and preview"
        aria-valuetext={`${position}% preview visible`}
      />
    </div>
  );
}
