'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',      label: 'Home' },
  { href: '/glp1',  label: 'GLP-1 Program' },
  { href: '/viewer', label: 'Viewer' },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      <nav className="mx-auto flex max-w-[1600px] items-center gap-1 px-6 py-3">
        <Link
          href="/"
          className="mr-5 text-base font-bold tracking-tight text-slate-900 hover:text-blue-700"
        >
          GlycoGLP
        </Link>

        {links.map(({ href, label }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </Link>
          );
        })}

        <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
          In Silico Drug Discovery
        </span>
      </nav>
    </header>
  );
}
