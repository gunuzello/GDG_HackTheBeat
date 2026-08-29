# Hack the Beat

Spring Boot와 React로 구성한 해커톤용 스타터입니다. 개발 중에는 프론트엔드와 백엔드를 각각 실행하고, Docker 배포 시에는 React 빌드 결과물을 Spring Boot 애플리케이션에 포함합니다.

## 기술 스택

- Java 21, Spring Boot 3.5, Maven
- React 19, Vite 7, JavaScript

## 개발 실행

백엔드:

```bash
./mvnw spring-boot:run
```

프론트엔드:

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 <http://localhost:5173>을 엽니다. `/api` 요청은 Vite 프록시를 통해 `http://localhost:8080`으로 전달됩니다.

## 테스트 및 빌드

```bash
./mvnw test
./mvnw clean package
cd frontend && npm run build
```

전체 배포 이미지는 다음 명령으로 만듭니다.

```bash
docker build -t hack-the-beat .
docker run --rm -p 8080:8080 hack-the-beat
```

백엔드는 `src/main/java/com/hackthebeat/app` 아래에 기능별 패키지로 추가하고, 프론트 API 호출은 `frontend/src/api`에 모읍니다.
