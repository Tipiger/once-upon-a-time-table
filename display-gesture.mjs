// Tilt the artwork inside the hit target; scale the target about its own center.
export function enableDisplayGesture(button) {
  const stage = button.closest('.inspection-stage');
  const frontLabel = button.getAttribute('aria-label');
  const points = new Map();
  let grip = null, pinch = null, zoom = 1;
  let suppressClick = false, frame = 0;

  function updateTilt() {
    frame = 0;
    if (!grip?.dragging) return;
    const {x, y} = grip;
    button.style.setProperty('--yaw', (x * 37).toFixed(2) + 'deg');
    button.style.setProperty('--pitch', (-y * 27).toFixed(2) + 'deg');
    const angle = Math.min(1, Math.abs(x + y * .48));
    button.style.setProperty('--foil-at', (125 - angle * 121).toFixed(1) + '%');
  }

  function resetTilt() {
    grip = null;
    cancelAnimationFrame(frame);
    frame = 0;
    button.classList.remove('is-tilting');
    for (const name of ['--yaw','--pitch','--foil-at']) button.style.removeProperty(name);
  }

  function separation() {
    const [a,b] = points.values();
    return Math.max(1, Math.hypot(a.x-b.x, a.y-b.y));
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || points.has(event.pointerId)) return;
    if (!points.size && event.target !== button) return;
    if (points.size && (event.pointerType !== 'touch' || points.values().next().value.type !== 'touch')) return;
    points.set(event.pointerId,{x:event.clientX, y:event.clientY, type:event.pointerType});
    button.setPointerCapture(event.pointerId);
    if (points.size === 1) {
      const rect = button.getBoundingClientRect();
      grip = {startX:event.clientX, startY:event.clientY, width:rect.width, height:rect.height, dragging:false};
      suppressClick = false;
    } else if (points.size === 2) {
      resetTilt();
      suppressClick = true;
      button.classList.add('is-pinching');
      pinch = {distance:separation(), zoom};
    }
  });

  stage.addEventListener('pointermove', event => {
    const p = points.get(event.pointerId);
    if (!p) return;
    p.x = event.clientX;
    p.y = event.clientY;
    if (pinch && points.size >= 2) {
      zoom = Math.min(4, Math.max(.75, pinch.zoom * separation() / pinch.distance));
      button.style.setProperty('--card-zoom', String(zoom));
      stage.classList.toggle('is-zoomed', zoom > 1);
      return;
    }
    if (!grip) return; // Lift all fingers after a pinch before tilting or tapping.
    const dx = p.x - grip.startX, dy = p.y - grip.startY;
    if (!grip.dragging && Math.hypot(dx, dy) < 7) return;
    grip.dragging = true;
    suppressClick = true;
    button.classList.add('is-tilting');
    grip.x = Math.max(-1, Math.min(1, dx / (grip.width * .48)));
    grip.y = Math.max(-1, Math.min(1, dy / (grip.height * .38)));
    if (!frame) frame = requestAnimationFrame(updateTilt);
  });

  function release(event) {
    if (!points.delete(event.pointerId)) return;
    if (event.type !== 'pointerup') suppressClick = true;
    resetTilt();
    pinch = points.size >= 2 ? {distance:separation(), zoom} : null;
    if (!points.size) button.classList.remove('is-pinching');
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(type, release);
  button.addEventListener('click', event => {
    if (event.detail && suppressClick) return;
    const back = button.dataset.back !== 'true';
    button.dataset.back = String(back);
    button.setAttribute('aria-label', back ? '牌背，翻回牌面' : frontLabel);
  });
}
