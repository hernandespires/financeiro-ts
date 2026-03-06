import Link from "next/link";

interface ActionCardButtonProps {
    href?: string;
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
}

const cls =
    "flex flex-col items-center justify-center gap-3 rounded-2xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 transition-colors p-5 min-h-[110px] text-center w-full";

export default function ActionCardButton({ href, icon, label, onClick }: ActionCardButtonProps) {
    const inner = (
        <>
            <span className="text-black [&>svg]:w-7 [&>svg]:h-7 [&>svg]:stroke-[1.8]">{icon}</span>
            <span className="text-xs font-bold text-black leading-tight">{label}</span>
        </>
    );

    if (href) {
        return (
            <Link href={href} className={cls}>
                {inner}
            </Link>
        );
    }

    return (
        <button onClick={onClick} className={cls}>
            {inner}
        </button>
    );
}
