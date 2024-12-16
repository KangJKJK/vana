#!/bin/bash

# 색깔 변수 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}VANA Faucet 스크립트를 시작합니다...${NC}"

# 기타 필요한 시스템 패키지 설치 (우분투/데비안 기준)
sudo apt-get update
sudo apt-get install -y build-essential
sudo apt-get install -y nodejs
sudo apt-get install -y npm
sudo apt-get install -y git

# 작업 디렉토리 설정
work="/root/vana"

# 작업 디렉토리 삭제 (존재할 경우)
if [ -d "$work" ]; then
    echo -e "${YELLOW}기존 작업 디렉토리를 삭제합니다...${NC}"
    rm -rf "$work"
fi

# 파일 다운로드 및 덮어쓰기
echo -e "${YELLOW}필요한 파일들을 다운로드합니다...${NC}"

# Git 설치
echo -e "${YELLOW}Git을 설치합니다...${NC}"
sudo apt install -y git

# Git 클론
echo -e "${YELLOW}Git 저장소 클론 중...${NC}"
git clone https://github.com/KangJKJK/vana

# 작업 디렉토리 이동
echo -e "${YELLOW}작업디렉토리를 이동합니다...${NC}"
cd "$work"

echo -e "${YELLOW}Node.js LTS 버전을 설치하고 설정 중...${NC}"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # nvm을 로드합니다
nvm install 18
nvm use 18

# Node.js 모듈 설치
echo -e "${YELLOW}필요한 Node.js 모듈을 설치합니다...${NC}"
sudo apt-get install -y build-essential
npm install node-fetch@2 puppeteer ethers https-proxy-agent dotenv puppeteer

# .env 파일 생성
echo -e "${YELLOW}.env 파일을 생성합니다...${NC}"
echo "CAPTCHA_API_KEY=" > $work/.env

# .gitignore 파일 생성
echo -e "${YELLOW}.gitignore 파일을 생성합니다...${NC}"
echo ".env" > $work/.gitignore

# 2captcha API 키 입력 안내
echo -e "${YELLOW}2captcha API 키를 입력하세요:${NC}"
read captcha_key
sed -i "s/CAPTCHA_API_KEY=/CAPTCHA_API_KEY=$captcha_key/" $work/.env

# 프록시 정보 입력 안내
echo -e "${YELLOW}프록시 정보를 입력하세요. 입력형식: http://proxyUser:proxyPass@IP:Port${NC}"
echo -e "${YELLOW}여러 개의 프록시는 줄바꿈으로 구분하세요.${NC}"
echo -e "${YELLOW}입력을 마치려면 엔터를 두 번 누르세요.${NC}"
echo -e "${YELLOW}입력하신 프록시 개수만큼 EVM 주소가 생성됩니다.${NC}"

# 프록시를 배열로 변환
proxy_array=()
while IFS= read -r line; do
    [[ -z "$line" ]] && break
    proxy_array+=("$line")
done

# 결과를 proxy_list.js 파일에 저장
{
    echo "export const proxyList = ["
    for proxy in "${proxy_array[@]}"; do
        echo "    \"$proxy\","
    done
    echo "];"
} > $work/proxy_list.js 

# vana.js 스크립트 실행
echo -e "${GREEN}vana.js 스크립트를 실행합니다...${NC}"
node --no-deprecation vana.js
