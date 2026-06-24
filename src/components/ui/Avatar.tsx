import React from 'react'
import Image from 'next/image'

interface AvatarProps {
  name: string
  size?: number
  src?: string
  style?: React.CSSProperties
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function hashColor(name: string) {
  const colors = ['#4A8C5C','#C47B2B','#6B8A99','#7B6E9A','#8C6B5C']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}

export function Avatar({ name, size = 32, src, style }: AvatarProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: hashColor(name), color: '#fff',
      fontSize: size * 0.38, fontWeight: 600, fontFamily: 'var(--font-sans)',
      flexShrink: 0, overflow: 'hidden',
      ...style,
    }}>
      {src
        ? <Image src={src} alt={name} width={size} height={size} style={{ objectFit: 'cover' }} />
        : getInitials(name)
      }
    </span>
  )
}
