import { useCallback, useEffect, useRef } from "react";

/**
 * Standard modal dismissal: Escape, and a click on the overlay.
 *
 * Spread the returned props on the `.modal-overlay` element. The overlay click is decided on
 * mouseUP, and only when the mouseDOWN landed on the overlay too — otherwise selecting text
 * inside the modal and releasing the button over the overlay would close it and throw the
 * input away.
 *
 * @param {() => void} onClose
 * @param {{ enabled?: boolean }} [options] - set enabled false while a nested layer owns dismissal
 * @returns {{ onMouseDown: Function, onMouseUp: Function }} props for the overlay element
 */
export default function useModalDismiss(onClose, { enabled = true } = {}) {
    const openedOnOverlayRef = useRef(false);

    useEffect(() => {
        if (!enabled) return undefined;
        const handleKey = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [enabled, onClose]);

    const onMouseDown = useCallback((event) => {
        openedOnOverlayRef.current = event.target === event.currentTarget;
    }, []);

    const onMouseUp = useCallback(
        (event) => {
            const startedAndEndedOnOverlay =
                openedOnOverlayRef.current && event.target === event.currentTarget;
            openedOnOverlayRef.current = false;
            if (enabled && startedAndEndedOnOverlay) onClose();
        },
        [enabled, onClose]
    );

    return { onMouseDown, onMouseUp };
}
