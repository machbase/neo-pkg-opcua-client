import { createPortal } from "react-dom";
import "../../styles/jsonKeyViewer.css";

export default function DataViewerModalPortal({ children }) {
    return createPortal(<div className="opcua-json-viewer">{children}</div>, document.body);
}
