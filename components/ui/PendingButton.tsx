"use client";
import { useFormStatus } from "react-dom";
import Spinner from "./Spinner";

type Props = {
  children: React.ReactNode;
  className?: string;
  spinnerSize?: number;
};

export default function PendingButton({ children, className = "", spinnerSize = 14 }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      className={
        "inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800 disabled:opacity-60 " +
        className
      }
      disabled={pending}
    >
      {pending && <Spinner size={spinnerSize} />}
      <span>{children}</span>
    </button>
  );
}


