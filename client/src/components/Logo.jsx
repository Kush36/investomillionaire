import { Link } from 'react-router-dom'

export default function Logo({ size = 'md', withText = true }) {
  const dims = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-16 w-16' }[size]
  return (
    <Link to="/" className="group flex items-center gap-3">
      <img
        src="/logo.jpg"
        alt="InvestoMillionaire"
        className={`${dims} rounded-xl object-cover ring-1 ring-gold/40 transition group-hover:ring-gold`}
      />
      {withText && (
        <span className="leading-none">
          <span className="block text-[15px] font-extrabold tracking-tight text-white">INVESTO</span>
          <span className="block text-[11px] font-bold tracking-[0.25em] text-gold">MILLIONAIRE</span>
        </span>
      )}
    </Link>
  )
}
