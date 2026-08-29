package com.hackthebeat.app.party;

import jakarta.annotation.PostConstruct;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@CrossOrigin(originPatterns = "*")
public class ChannelController {
    private static final String[] PALETTE = {"#FF2E7E", "#00E5FF", "#B24BF3", "#FFD93D", "#39FF88"};
    private static final String DEFAULT_VIDEO = "K4DyBUG242c"; // NCS: Cartoon - On & On

    record Room(String id, String name, long createdAt) {}

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, Channel> channels = new ConcurrentHashMap<>();
    private final AtomicInteger colorIdx = new AtomicInteger(0);
    private final SimpMessagingTemplate messaging;

    public ChannelController(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    @PostConstruct
    void seed() {
        createRoomInternal("메인 파티룸", DEFAULT_VIDEO);
    }

    private Map<String, Object> createRoomInternal(String name, String videoId) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);
        Room room = new Room(roomId, name, System.currentTimeMillis());
        rooms.put(roomId, room);
        String color = PALETTE[colorIdx.getAndIncrement() % PALETTE.length];
        Channel main = new Channel("main-" + roomId, roomId, "DJ MAIN",
                videoId == null || videoId.isBlank() ? DEFAULT_VIDEO : videoId, color, true);
        main.setOwnerKey(UUID.randomUUID().toString());
        channels.put(main.id, main);
        return Map.of("id", room.id(), "name", room.name(),
                "mainChannelId", main.id, "ownerKey", main.ownerKey());
    }

    @GetMapping("/api/time")
    public Map<String, Long> time() {
        return Map.of("serverTimeMillis", System.currentTimeMillis());
    }

    @GetMapping("/rooms")
    public List<Map<String, Object>> listRooms() {
        return rooms.values().stream()
                .map(r -> {
                    List<Channel> chs = channels.values().stream()
                            .filter(c -> c.roomId.equals(r.id())).toList();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.id());
                    m.put("name", r.name());
                    m.put("channelCount", chs.size());
                    m.put("listenerCount", chs.stream().mapToInt(Channel::getListenerCount).sum());
                    m.put("colorHex", chs.stream().filter(Channel::getIsMain)
                            .map(Channel::getColorHex).findFirst().orElse(PALETTE[0]));
                    return m;
                })
                .sorted(Comparator.<Map<String, Object>>comparingInt(m -> (int) m.get("listenerCount")).reversed())
                .toList();
    }

    @PostMapping("/rooms")
    public Map<String, Object> createRoom(@RequestBody Map<String, String> body) {
        Map<String, Object> result = createRoomInternal(body.get("name"), body.get("youtubeVideoId"));
        broadcast();
        return result;
    }

    @GetMapping("/channels")
    public List<Channel> listChannels() {
        return channels.values().stream()
                .sorted(Comparator.comparing(Channel::getIsMain).reversed()
                        .thenComparing(Channel::getStartedAt))
                .toList();
    }

    @PostMapping("/rooms/{roomId}/channels")
    public Map<String, Object> create(@PathVariable String roomId, @RequestBody Map<String, String> body) {
        String color = PALETTE[colorIdx.getAndIncrement() % PALETTE.length];
        Channel ch = new Channel(UUID.randomUUID().toString().substring(0, 8), roomId,
                body.get("name"), body.get("youtubeVideoId"), color, false);
        ch.setOwnerKey(UUID.randomUUID().toString());
        channels.put(ch.id, ch);
        broadcast();
        return Map.of("channel", ch, "ownerKey", ch.ownerKey());
    }

    // 채널 주인만 곡 추가 가능 (ownerKey 검증)
    @PostMapping("/channels/{id}/queue")
    public Channel addToQueue(@PathVariable String id, @RequestBody Map<String, String> body) {
        Channel ch = channels.get(id);
        if (ch != null && ch.ownerKey() != null && ch.ownerKey().equals(body.get("ownerKey"))) {
            ch.queue.add(body.get("youtubeVideoId"));
            broadcast();
        }
        return ch;
    }

    // fromVideoId가 현재 곡과 일치할 때만 넘어감 → 여러 클라이언트가 동시에 호출해도 한 번만 전진
    @PostMapping("/channels/{id}/next")
    public Channel next(@PathVariable String id, @RequestBody Map<String, String> body) {
        Channel ch = channels.get(id);
        if (ch != null) {
            synchronized (ch) {
                if (ch.youtubeVideoId.equals(body.get("fromVideoId"))) {
                    if (!ch.queue.isEmpty()) ch.youtubeVideoId = ch.queue.remove(0);
                    ch.startedAt = System.currentTimeMillis();
                }
            }
            broadcast();
        }
        return ch;
    }

    @PostMapping("/channels/{id}/join")
    public Channel join(@PathVariable String id, @RequestBody Map<String, String> body) {
        Channel ch = channels.get(id);
        if (ch != null) {
            ch.join(Map.of(
                    "clientId", body.getOrDefault("clientId", "anon"),
                    "nickname", body.getOrDefault("nickname", "게스트"),
                    "emoji", body.getOrDefault("emoji", "🎧")));
            broadcast();
        }
        return ch;
    }

    // sendBeacon 호환을 위해 쿼리 파라미터 사용
    @PostMapping("/channels/{id}/leave")
    public Channel leave(@PathVariable String id, @RequestParam(required = false) String clientId) {
        Channel ch = channels.get(id);
        if (ch != null) { ch.leave(clientId); broadcast(); }
        return ch;
    }

    @PostMapping("/poke")
    public Map<String, String> poke(@RequestBody Map<String, String> body) {
        messaging.convertAndSend("/topic/poke/" + body.get("toClientId"),
                (Object) Map.of("fromNickname", body.getOrDefault("fromNickname", "누군가"),
                        "fromEmoji", body.getOrDefault("fromEmoji", "🎧")));
        return Map.of("status", "ok");
    }

    private void broadcast() {
        messaging.convertAndSend("/topic/channels", listChannels());
        messaging.convertAndSend("/topic/rooms", listRooms());
    }
}
