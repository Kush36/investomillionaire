import { Link } from 'react-router-dom'

export default function Logo({ size = 'md', withText = true }) {
  const dims = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-16 w-16' }[size]
  return (
    <Link to="/" className="group flex items-center gap-3">
      <img
        src="/logo.jpg"
        alt="InvestoMillionaire"
        className={`${dims} rounded-xl object-cover ring-1 ring-hairline transition group-hover:ring-hairline-strong`}
      />
      {withText && (
        <span className="leading-none">
          <span className="block font-display text-[19px] leading-none tracking-tight text-ink">INVESTO</span>
          <span className="block font-mono text-[11px] font-medium tracking-[0.18em] text-brass">MILLIONAIRE</span>
        </span>
      )}
    </Link>
  )
}
