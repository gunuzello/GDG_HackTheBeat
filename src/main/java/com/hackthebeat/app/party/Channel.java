package com.hackthebeat.app.party;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

public class Channel {
    public String id;
    public String roomId;
    public String name;
    public volatile String youtubeVideoId;
    public volatile long startedAt;
    public String colorHex;
    public boolean isMain;
    public final List<String> queue = new CopyOnWriteArrayList<>();
    private final List<Map<String, String>> riders = new CopyOnWriteArrayList<>();
    private String ownerKey;

    // getter 형태가 아니라서 JSON 직렬화에 노출되지 않음
    public String ownerKey() { return ownerKey; }
    public void setOwnerKey(String key) { this.ownerKey = key; }

    public Channel(String id, String roomId, String name, String videoId, String colorHex, boolean isMain) {
        this.id = id;
        this.roomId = roomId;
        this.name = name;
        this.youtubeVideoId = videoId;
        this.startedAt = System.currentTimeMillis();
        this.colorHex = colorHex;
        this.isMain = isMain;
    }

    public int getListenerCount() { return riders.size(); }
    public List<Map<String, String>> getRiders() { return riders; }
    public void join(Map<String, String> rider) {
        String cid = rider.get("clientId");
        riders.removeIf(r -> r.get("clientId").equals(cid));
        riders.add(rider);
    }
    public void leave(String clientId) {
        if (clientId != null) riders.removeIf(r -> clientId.equals(r.get("clientId")));
    }

    public String getId() { return id; }
    public String getRoomId() { return roomId; }
    public String getName() { return name; }
    public String getYoutubeVideoId() { return youtubeVideoId; }
    public long getStartedAt() { return startedAt; }
    public String getColorHex() { return colorHex; }
    public boolean getIsMain() { return isMain; }
    public List<String> getQueue() { return queue; }
}
