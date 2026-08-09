import { theme } from "../theme";

interface Props {
  size?: number;
}

export default function LogoMark({ size = 28 }: Props): React.ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.21,
        background: theme.bgElevated,
        border: `1px solid ${theme.borderAccent}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="14" width="4" height="9" rx="1" fill={theme.red} />
        <rect x="9" y="8" width="4" height="15" rx="1" fill={theme.red} />
        <rect x="17" y="1" width="4" height="22" rx="1" fill={theme.red} />
      </svg>
    </div>
  );
}
