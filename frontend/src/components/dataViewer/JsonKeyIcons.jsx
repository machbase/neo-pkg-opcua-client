import Icon from "../common/Icon";
const glyph = (name) => function Glyph({ className = "" }) {
    return <Icon name={name} className={`icon-sm ${className}`} />;
};
export const VscArrowLeft = glyph("arrow_back");
export const VscChevronDown = glyph("expand_more");
export const VscChevronUp = glyph("expand_less");
export const VscChevronLeft = glyph("chevron_left");
export const VscCheck = glyph("check");
export const VscCopy = glyph("content_copy");
export const VscError = glyph("error");
export const VscChevronRight = glyph("chevron_right");
export const VscChromeClose = glyph("close");
export const VscClearAll = glyph("clear_all");
export const VscClose = glyph("close");
export const VscListSelection = glyph("checklist");
export const VscSymbolArray = glyph("data_array");
export const VscSymbolBoolean = glyph("toggle_on");
export const VscSymbolNamespace = glyph("data_object");
export const VscSymbolNumeric = glyph("numbers");
export const VscSymbolString = glyph("text_fields");
// Same roadmap icon as neo-web's MuiTagAnalyzer.
export function MuiTagAnalyzer({ width = 18, height = 18, className = "" }) {
    return <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.242 3.242h1.752v15.764h15.764v1.752H3.243V3.243m4.379 7.006h8.757v2.627H7.622V10.25m3.503 4.379h8.757v2.627h-8.757v-2.627M6.746 4.994h14.012v3.503h-1.751V6.746H8.497v1.751h-1.75z" fill="#26a69a" />
    </svg>;
}
