// Dragging a building or a unit with the pointer instead of the browser's drag and drop, which cannot change the
// cursor. Once the pointer moves a few pixels, a copy of the piece (the ghost) follows it, held at (offsetX, offsetY),
// with a closed hand over a target (a highlighted cell or building, or a player board a trader can go on) or over
// home (where it came from, to put it back), and the not-allowed pointer elsewhere. Letting go on a target clicks it,
// just like clicking the piece and then its target; anywhere else calls onCancel.
export const startPointerDrag = (
	event: PointerEvent,
	options: {
		home: Element | null;
		makeGhost: () => { element: HTMLElement; offsetX: number; offsetY: number };
		onStart: () => void;
		onCancel: () => void;
	}
) => {
	if (event.button !== 0) return;
	const start = { x: event.clientX, y: event.clientY };
	let ghost: ReturnType<typeof options.makeGhost> | null = null;
	const root = document.documentElement;

	// the cell, building or player board under an element (the ghost lets the pointer through)
	const areaOf = (element: Element | null) => element?.closest<HTMLElement>('.cell, .placed, .player-board');
	const isTarget = (area: HTMLElement | null | undefined) => !!area?.matches('.valid, .target');

	const move = (e: PointerEvent) => {
		if (!ghost) {
			if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) <= 4) return;
			ghost = options.makeGhost();
			ghost.element.classList.add('drag-ghost');
			document.body.append(ghost.element);
			options.onStart();
		}
		ghost.element.style.left = `${e.clientX - ghost.offsetX}px`;
		ghost.element.style.top = `${e.clientY - ghost.offsetY}px`;
		const under = document.elementFromPoint(e.clientX, e.clientY);
		const isAllowed = isTarget(areaOf(under)) || (!!under && !!options.home?.contains(under));
		root.classList.toggle('grabbing', isAllowed);
		root.classList.toggle('not-allowed', !isAllowed);
	};

	const end = (e: PointerEvent) => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', end);
		window.removeEventListener('pointercancel', end);
		if (!ghost) return; // not moved: a click, handled by the piece itself
		ghost.element.remove();
		root.classList.remove('grabbing', 'not-allowed');
		const area = e.type === 'pointerup' ? areaOf(document.elementFromPoint(e.clientX, e.clientY)) : null;
		if (area && isTarget(area)) area.click();
		else options.onCancel();
		// the browser's own click after letting go would select the piece again
		const stop = (click: MouseEvent) => click.stopPropagation();
		window.addEventListener('click', stop, { capture: true, once: true });
		setTimeout(() => window.removeEventListener('click', stop, { capture: true }));
	};

	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', end);
	window.addEventListener('pointercancel', end);
};
