// Adapted from neo-web PR #737 (JSON value key exploration).
import { useEffect, useRef } from 'react';
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const focusableWithin = (root) => Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => element.getClientRects().length > 0);
export const useModalDialog = (label) => {
    const anchorRef = useRef(null);
    const labelRef = useRef(label);
    labelRef.current = label;
    useEffect(() => {
        const dialog = anchorRef.current?.closest('.modal');
        if (!dialog)
            return undefined;
        const opener = document.activeElement;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', labelRef.current);
        if (!dialog.hasAttribute('tabindex'))
            dialog.setAttribute('tabindex', '-1');
        if (!dialog.contains(document.activeElement))
            dialog.focus({ preventScroll: true });
        const onKeyDown = (event) => {
            if (event.key !== 'Tab')
                return;
            const items = focusableWithin(dialog);
            const active = document.activeElement;
            if (items.length === 0) {
                event.preventDefault();
                dialog.focus({ preventScroll: true });
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (!dialog.contains(active)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
            else if (event.shiftKey && (active === first || active === dialog)) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            if (opener?.isConnected && opener !== document.body)
                opener.focus({ preventScroll: true });
        };
    }, []);
    return anchorRef;
};
export default useModalDialog;
