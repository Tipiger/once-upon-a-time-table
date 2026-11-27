// Keep the hit target stationary while the card inside it turns towards the finger.
export function enableDisplayGesture(button) {
  const frontLabel = button.getAttribute('aria-label');
  let grip = null;
  let suppressClick = false;
  let frame = 0;

  function updateTilt() {
    frame = 0;
    if (!grip?.dragging) return;
    const {x, y} = grip;
    button.style.setProperty('--yaw', (x * 37).toFixed(2) + 'deg');
    button.style.setProperty('--pitch', (-y * 27).toFixed(2) + 'deg');
    // Move the reflection across the printed surface as the card tilts.
    const angle = Math.min(1, Math.abs(x + y * .48));
    button.style.setProperty('--foil-at', (125 - angle * 121).toFixed(1) + '%');
  }

  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || grip) return;
    const rect = button.getBoundingClientRect();
    grip = {id:event.pointerId, startX:event.clientX, startY:event.clientY,
      width:rect.width, height:rect.height, dragging:false};
    suppressClick = false;
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener('pointermove', event => {
    if (event.pointerId !== grip?.id) return;
    const dx = event.clientX - grip.startX, dy = event.clientY - grip.startY;
    if (!grip.dragging && Math.hypot(dx, dy) < 7) return;
    grip.dragging = true;
    button.classList.add('is-tilting');
    grip.x = Math.max(-1, Math.min(1, dx / (grip.width * .48)));
    grip.y = Math.max(-1, Math.min(1, dy / (grip.height * .38)));
    if (!frame) frame = requestAnimationFrame(updateTilt);
  });

  function release(event) {
    if (event.pointerId !== grip?.id) return;
    suppressClick = grip.dragging || event.type !== 'pointerup';
    grip = null;
    cancelAnimationFrame(frame);
    frame = 0;
    button.classList.remove('is-tilting');
    for (const name of ['--yaw','--pitch','--foil-at']) button.style.removeProperty(name);
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(type, release);
  }
  button.addEventListener('click', event => {
    if (event.detail && suppressClick) return;
    const back = button.dataset.back !== 'true';
    button.dataset.back = String(back);
    button.setAttribute('aria-label', back ? '牌背，翻回牌面' : frontLabel);
  });
}
