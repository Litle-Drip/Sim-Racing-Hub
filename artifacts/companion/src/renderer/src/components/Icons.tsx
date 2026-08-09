interface IconProps {
  size?: number;
  color?: string;
}

const common = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconLock({ size = 15, color = "currentColor" }: IconProps): React.ReactElement {
  return (
    <svg {...common(size)} stroke={color}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function IconGamepad({ size = 15, color = "currentColor" }: IconProps): React.ReactElement {
  return (
    <svg {...common(size)} stroke={color}>
      <path d="M6.5 8.5h11a4 4 0 0 1 3.9 4.9l-.7 3a3 3 0 0 1-5.3 1.1L14 16H10l-1.4 1.5a3 3 0 0 1-5.3-1.1l-.7-3a4 4 0 0 1 3.9-4.9Z" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="16" cy="11.5" r="0.6" fill={color} />
      <circle cx="18" cy="13.5" r="0.6" fill={color} />
    </svg>
  );
}

export function IconActivity({ size = 15, color = "currentColor" }: IconProps): React.ReactElement {
  return (
    <svg {...common(size)} stroke={color}>
      <polyline points="3.5 13 8 13 10 8 14 18 16 13 20.5 13" />
    </svg>
  );
}

export function IconCloudUpload({ size = 15, color = "currentColor" }: IconProps): React.ReactElement {
  return (
    <svg {...common(size)} stroke={color}>
      <path d="M7.5 17.5a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.63-1.79A4.5 4.5 0 0 1 16.5 17.5h-9Z" />
      <path d="M12 10v6.5M9.5 12.5 12 10l2.5 2.5" />
    </svg>
  );
}

export function IconCopy({ size = 14, color = "currentColor" }: IconProps): React.ReactElement {
  return (
    <svg {...common(size)} stroke={color}>
      <rect x="8.5" y="8.5" width="10" height="10" rx="1.5" />
      <path d="M5.5 15.5h-1a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 14 6v1" />
    </svg>
  );
}

export function IconCheck({ size = 14, color = "currentColor" }: IconProps): React.ReactElement {
  return (
    <svg {...common(size)} stroke={color}>
      <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}
