// Small popups instead of the browser's alert() and confirm(): one at a time, shown by Popup.svelte in the layout.

type Popup = { message: string; isConfirm: boolean; resolve: (ok: boolean) => void };

export const popup = $state<{ current: Popup | null }>({ current: null });

const open = (message: string, isConfirm: boolean) =>
	new Promise<boolean>((resolve) => {
		popup.current?.resolve(false);
		popup.current = { message, isConfirm, resolve };
	});

// Resolves to true for OK, false for Cancel (or Escape).
export const confirmPopup = (message: string) => open(message, true);

// A message with only an OK button.
export const alertPopup = async (message: string) => {
	await open(message, false);
};

export const closePopup = (ok: boolean) => {
	popup.current?.resolve(ok);
	popup.current = null;
};
