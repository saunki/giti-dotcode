// The loading screen lives in index.html (it shows before any script runs); this drives it.

const bar = () => document.getElementById('loader-bar')

/** Files loaded, 0..100 (drei useProgress). The last stretch is kept for the scene warming up. */
export function setLoadProgress(percent) {
  const el = bar()
  if (el) el.style.width = `${Math.max(4, percent * 0.9)}%`
}

/** The tire has drawn: fill the bar, fade the screen out, then remove it. */
export function hideLoader() {
  const loader = document.getElementById('loader')
  if (!loader || loader.classList.contains('done')) return
  bar().style.width = '100%'
  setTimeout(() => {
    loader.classList.add('done')
    setTimeout(() => loader.remove(), 800)
  }, 250)
}
