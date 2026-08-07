export async function collectVoiceStats(peer, mediaDiagnostics = {}) {
    const base = {
        connectionState: peer?.connectionState || "closed",
        iceConnectionState: peer?.iceConnectionState || "closed",
        iceGatheringState: peer?.iceGatheringState || "closed",
        signalingState: peer?.signalingState || "closed",
        selectedCandidatePath: "unknown",
        candidatePath: "unknown",
        localCandidateType: "",
        remoteCandidateType: "",
        packetsReceived: 0,
        bytesReceived: 0,
        packetsSent: 0,
        bytesSent: 0,
        jitter: 0,
        packetsLost: 0,
        ...mediaDiagnostics
    };
    if (!peer?.getStats) return base;
    try {
        const report = await peer.getStats();
        const selectedPair = findSelectedPair(report);
        const inbound = findStat(report, "inbound-rtp", "audio") || {};
        const outbound = findStat(report, "outbound-rtp", "audio") || {};
        if (!selectedPair) {
            return {
                ...base,
                packetsReceived: Number(inbound.packetsReceived || 0),
                bytesReceived: Number(inbound.bytesReceived || 0),
                packetsSent: Number(outbound.packetsSent || 0),
                bytesSent: Number(outbound.bytesSent || 0),
                jitter: Number(inbound.jitter || 0),
                packetsLost: Number(inbound.packetsLost || 0)
            };
        }
        const local = report.get(selectedPair.localCandidateId) || {};
        const remote = report.get(selectedPair.remoteCandidateId) || {};
        const localType = local.candidateType || "";
        const remoteType = remote.candidateType || "";
        const path = localType === "relay" || remoteType === "relay"
            ? "TURN"
            : localType === "srflx" || remoteType === "srflx"
                ? "STUN"
                : localType === "host" || remoteType === "host"
                    ? "direct"
                    : "unknown";
        return {
            ...base,
            selectedCandidatePath: path,
            candidatePath: path,
            localCandidateType: localType,
            remoteCandidateType: remoteType,
            packetsReceived: Number(inbound.packetsReceived || 0),
            bytesReceived: Number(inbound.bytesReceived || 0),
            packetsSent: Number(outbound.packetsSent || 0),
            bytesSent: Number(outbound.bytesSent || 0),
            jitter: Number(inbound.jitter || 0),
            packetsLost: Number(inbound.packetsLost || 0)
        };
    } catch {
        return base;
    }
}

function findSelectedPair(report) {
    for (const stat of report.values()) {
        if (stat.type === "candidate-pair" && (stat.selected || stat.nominated || stat.state === "succeeded")) return stat;
    }
    return null;
}

function findStat(report, type, kind) {
    for (const stat of report.values()) {
        if (stat.type === type && (stat.kind === kind || stat.mediaType === kind)) return stat;
    }
    return null;
}
