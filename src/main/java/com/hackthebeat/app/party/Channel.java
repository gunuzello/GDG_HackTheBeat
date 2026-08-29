package com.hackthebeat.app.party;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ConcurrentHashMap;

public class Channel {
    public String id;
    public String roomId;
    public String name;
    public volatile String youtubeVideoId;
    public volatile long startedAt;
    // 채널이 처음 생성된 시각 (곡이 바뀌어도 변하지 않음 — 나무 성장/분기점 기준)
    public final long createdAt = System.currentTimeMillis();
    public String colorHex;
    public boolean isMain;
    public String parentId;
    public double parentElapsedSecondsAtCreation;
    public final List<String> queue = new CopyOnWriteArrayList<>();
    private final List<Map<String, String>> riders = new CopyOnWriteArrayList<>();
    private final Map<String, Long> lastSeen = new ConcurrentHashMap<>();
    private String ownerKey;

    // getter 형태가 아니라서 JSON 직렬화에 노출되지 않음
    public String ownerKey() { return ownerKey; }
    public void setOwnerKey(String key) { this.ownerKey = key; }

    public Channel(String id, String roomId, String name, String videoId, String colorHex, boolean isMain,
                   String parentId, double parentElapsedSecondsAtCreation) {
        this.id = id;
        this.roomId = roomId;
        this.name = name;
        this.youtubeVideoId = videoId;
        this.startedAt = System.currentTimeMillis();
        this.colorHex = colorHex;
        this.isMain = isMain;
        this.parentId = parentId;
        this.parentElapsedSecondsAtCreation = parentElapsedSecondsAtCreation;
    }

    public int getListenerCount() { return riders.size(); }
    public List<Map<String, String>> getRiders() { return riders; }
    public void join(Map<String, String> rider) {
        String cid = rider.get("clientId");
        riders.removeIf(r -> r.get("clientId").equals(cid));
        riders.add(rider);
        lastSeen.put(cid, System.currentTimeMillis());
    }
    public void leave(String clientId) {
        if (clientId != null) {
            riders.removeIf(r -> clientId.equals(r.get("clientId")));
            lastSeen.remove(clientId);
        }
    }
    public boolean removeStaleRiders(long cutoff) {
        int before = riders.size();
        riders.removeIf(r -> lastSeen.getOrDefault(r.get("clientId"), 0L) < cutoff);
        lastSeen.entrySet().removeIf(entry -> entry.getValue() < cutoff);
        return riders.size() != before;
    }

    public String getId() { return id; }
    public String getRoomId() { return roomId; }
    public String getName() { return name; }
    public String getYoutubeVideoId() { return youtubeVideoId; }
    public long getStartedAt() { return startedAt; }
    public long getCreatedAt() { return createdAt; }
    public String getColorHex() { return colorHex; }
    public boolean getIsMain() { return isMain; }
    public String getParentId() { return parentId; }
    public double getParentElapsedSecondsAtCreation() { return parentElapsedSecondsAtCreation; }
    public List<String> getQueue() { return queue; }
}
