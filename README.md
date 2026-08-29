# Hack the Beat

Spring Boot와 바닐라 JavaScript로 구성한 해커톤용 스타터입니다. 하나의 애플리케이션이 REST API와 프론트엔드 정적 파일을 함께 제공합니다.

## 기술 스택

- Java 21, Spring Boot 3.5, Maven
- HTML, CSS, JavaScript (ES Modules)

## 실행

```bash
./mvnw spring-boot:run
```

브라우저에서 <http://localhost:8080>을 열고, 상태 API는 <http://localhost:8080/api/health>에서 확인합니다.

## 테스트 및 빌드

```bash
./mvnw test
./mvnw clean package
```

백엔드는 `src/main/java/com/hackthebeat/app` 아래에 기능별 패키지로 추가하고, 프론트 API 호출은 `src/main/resources/static/js/api.js`에 모읍니다.
