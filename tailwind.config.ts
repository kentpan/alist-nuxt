import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'

export default <Partial<Config>>{
  content: ['./app/**/*.{vue,js,ts}', './components/**/*.{vue,js,ts}', './layouts/**/*.vue', './pages/**/*.vue'],
  theme: { extend: {} },
  plugins: [forms, typography]
}
