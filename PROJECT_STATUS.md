# 프로젝트 현황

## 행사 맥락

- 행사: Google I/O Extended Hack the Beat
- 개발 방식: 공개 주제에 맞춰 짧은 시간 안에 에이전트와 협업해 제품을 구현
- 개발 전략: 하나의 명확한 핵심 기능과 안정적인 데모를 우선
- 심사 특성: 심사 Agent가 결과물을 평가하므로 실행 방법과 제품 설명을 명확하게 유지

## 현재 완료된 작업

### 백엔드

- Java 17 및 Spring Boot 3.5 기반 Maven 프로젝트 구성
- 애플리케이션 진입점 생성
- `GET /api/health` 상태 확인 API 구현
- 일관된 JSON 오류 응답을 위한 전역 예외 처리 추가
- Jakarta Validation 의존성 준비

### 프론트엔드

- React와 Vite 기반 JavaScript 프로젝트 구성
- React 컴포넌트 및 ES Module 기반 API 호출 모듈 분리
- 백엔드 상태를 화면에서 확인할 수 있는 기본 랜딩 페이지 구현
- 개발 환경에서 `/api` 요청을 Spring Boot로 전달하는 Vite 프록시 구성
- Docker 빌드 시 React 결과물을 Spring Boot 정적 파일로 포함하도록 구성
- 특정 동승자에게 버튼을 누르는 동안만 음성을 보내는 WebRTC 1:1 귓속말과 음악 덕킹 구현

### 개발 환경 및 검증

- Maven Wrapper 추가
- 기본 애플리케이션 컨텍스트 테스트 추가
- 상태 API MVC 테스트 추가
- 현재 테스트에서 사용하지 않는 Mockito를 제외해 Java 24에서도 안정적으로 실행되도록 구성
- Docker 멀티 스테이지 빌드 파일 추가
- IDE, 빌드 결과물, 환경설정 파일용 `.gitignore` 추가
- `./mvnw test` 기준 테스트 2개 통과

## 디렉터리 구조

```text
.
├── pom.xml
├── mvnw
├── Dockerfile
├── frontend
│   ├── package.json
│   ├── vite.config.js
│   └── src
│       ├── api
│       ├── App.jsx
│       └── main.jsx
└── src
    ├── main
    │   ├── java/com/hackthebeat/app
    │   │   ├── common
    │   │   └── health
    │   └── resources/application.yml
    └── test/java/com/hackthebeat/app
```

## 주요 결정

- 개발 중에는 React와 Spring Boot를 독립 실행해 빠른 새로고침을 사용한다.
- 배포 시에는 React 빌드 결과물을 Spring Boot 애플리케이션에 포함해 단일 컨테이너로 실행한다.
- 기능은 기술 계층별 패키지보다 `health`와 같은 기능별 패키지로 확장한다.
- 데이터베이스, 인증, 외부 AI API는 주제가 정해진 뒤 필요한 것만 추가한다.
- 비밀 값은 코드에 저장하지 않고 환경 변수 또는 로컬 설정 파일로 관리한다.

## 주제 공개 후 할 일

1. 문제, 사용자, 핵심 데모를 한 문장씩 확정한다.
2. 제품 기능 패키지와 REST API를 추가한다.
3. 기본 랜딩 페이지를 실제 사용자 흐름으로 교체한다.
4. 필요한 경우에만 데이터베이스 및 외부 API를 연결한다.
5. README에 제품 설명, 실행 방법, 데모 시나리오, 심사 포인트를 반영한다.
