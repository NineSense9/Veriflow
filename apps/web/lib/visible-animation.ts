/** Schedule frames only while the effect is visible, including browser tab visibility. */
export function startVisibleAnimation(element: Element, draw: (time: number) => void) {
  let frame = 0;
  let intersects = false;
  let disposed = false;
  const tick = (time: number) => {
    frame = 0;
    if (disposed || !intersects || document.hidden) return;
    draw(time);
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!disposed && intersects && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const observer = new IntersectionObserver(([entry]) => {
    intersects = entry.isIntersecting;
    sync();
  });
  observer.observe(element);
  document.addEventListener("visibilitychange", sync);
  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("visibilitychange", sync);
  };
}
