import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "linear-gradient(145deg, #070a1c 0%, #05060f 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient cyan glow */}
        <div
          style={{
            position: "absolute",
            top: -20,
            left: -20,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        {/* Ambient purple glow */}
        <div
          style={{
            position: "absolute",
            bottom: -20,
            right: -10,
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(217,70,239,0.2) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        {/* Stock chart bars */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 9,
            zIndex: 1,
          }}
        >
          {[44, 68, 52, 88, 60].map((h, i) => (
            <div
              key={i}
              style={{
                width: 17,
                height: h,
                background: `rgba(34,211,238,${0.55 + i * 0.1})`,
                borderRadius: 5,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
