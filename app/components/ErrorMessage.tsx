interface Props {
  message: string
}

export default function ErrorMessage({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
      <p className="text-sm text-red-400 max-w-xs">{message}</p>
    </div>
  )
}
