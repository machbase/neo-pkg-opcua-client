import useModalDismiss from "../../hooks/useModalDismiss";

export default function JsonKeyModal({ children, className, onOutSideClose }) {
    const dismiss = useModalDismiss(onOutSideClose);
    return <div className="modal-overlay" {...dismiss}><div className={`modal animate-fade-in ${className}`}>{children}</div></div>;
}
