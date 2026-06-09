import { useEffect } from "react";
import { useParams } from "react-router";
import { useApp } from "../context/AppContext";
import DataViewerPage from "./DataViewerPage";

export default function CollectorDataViewerRoute({ collectors, detail }) {
    const { collectorId = "" } = useParams();
    const { selectedCollectorId, setSelectedCollectorId } = useApp();

    useEffect(() => {
        if (collectorId && selectedCollectorId !== collectorId) {
            setSelectedCollectorId(collectorId);
        }
    }, [collectorId, selectedCollectorId, setSelectedCollectorId]);

    const activeDetail = selectedCollectorId === collectorId ? detail : null;

    return <DataViewerPage collectors={collectors} detail={activeDetail} />;
}
