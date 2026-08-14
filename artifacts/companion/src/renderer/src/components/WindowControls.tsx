import { theme } from "../theme";

export default function WindowControls(): React.ReactElement {
  const buttonStyle: React.CSSProperties = {
    WebkitAppRegion: "no-drag",
    width: 28,
    height: 22,
    borderRadius: 5,
    background: "transparent",
    color: theme.gray,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    lineHeight: 1,
  } as React.CSSProperties;

  return (
    <div style={{ display: "flex", gap: 2, marginLeft: "auto" } as React.CSSProperties}>
      <button
        onClick={() => window.companion.minimizeWindow()}
        title="Minimize"
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = theme.borderAccent)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        −
      </button>
      <button
        onClick={() => window.companion.closeWindow()}
        title="Close"
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = theme.red)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        ✕
      </button>
    </div>
  );
}
