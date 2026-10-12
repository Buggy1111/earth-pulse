import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StarPanel } from './StarPanel'

const pick = (name: string) => ({ name, distLy: 300, spect: 'M7IIIe', mag: 3 })

describe('StarPanel photos', () => {
  it('shows a newly added star photo with its credit', () => {
    render(<StarPanel star={pick('Mira')} onClose={() => {}} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('stars/cards/mira.webp')
    expect(img.getAttribute('alt')).toBe('Mira — real telescope image')
    expect(screen.getByText(/Karovska/)).toBeTruthy()
  })

  it('labels an artist concept honestly', () => {
    render(<StarPanel star={pick('Gl 581')} onClose={() => {}} />)
    expect(screen.getByRole('img').getAttribute('alt')).toBe("Gl 581 — artist's concept")
  })

  it('shows no photo for an unresolved star', () => {
    render(<StarPanel star={pick('Gl 1')} onClose={() => {}} />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
