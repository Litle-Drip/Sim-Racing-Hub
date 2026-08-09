import { theme } from "../theme";

type Variant = "primary" | "secondary" | "icon";

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
}

const base: Record<Variant, React.CSSProperties> = {
  primary: {
    background: theme.red,
    color: "#fff",
    border: "1px solid transparent",
    fontWeight: 600,
  },
  secondary: {
    background: theme.bgElevated,
    color: theme.gray,
    border: `1px solid ${theme.borderAccent}`,
    fontWeight: 500,
  },
  icon: {
    background: "transparent",
    color: theme.gray,
    border: "1px solid transparent",
    fontWeight: 500,
  },
};

const hover: Record<Variant, React.CSSProperties> = {
  primary: { background: theme.redHover },
  secondary: { background: "#222222", color: theme.white, borderColor: theme.gray },
  icon: { background: theme.bgElevated, color: theme.white },
};

export default function Button({ children, onClick, variant = "secondary", disabled, style, title }: Props): React.ReactElement {
  const restBase = base[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 13,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...restBase,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        Object.assign(e.currentTarget.style, hover[variant]);
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        Object.assign(e.currentTarget.style, restBase, style);
      }}
    >
      {children}
    </button>
  );
}
