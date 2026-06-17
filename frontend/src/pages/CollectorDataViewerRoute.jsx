import { useEffect } from "react";
import { useParams } from "react-router";
import { useApp } from "../context/AppContext";
import DataViewerPage from "./DataViewerPage";

export default function CollectorDataViewerRoute({ collectors, detail }) {
    const { collectorId = "" } = useParams();
    const { selectedCollectorId, setSelectedCollectorId } = useApp();

    useEffect(() => {
        if (collectorId) {
            setSelectedCollectorId((current) => (current === collectorId ? current : collectorId));
        }
    }, [collectorId, setSelectedCollectorId]);

    const activeDetail = selectedCollectorId === collectorId && detail?.name === collectorId ? detail : null;

    return <DataViewerPage collectors={collectors} detail={activeDetail} />;
}
