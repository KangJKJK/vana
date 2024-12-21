// ethers.js 임포트 필요
const { ethers } = require('ethers');
const puppeteer = require('puppeteer');
const fs = require('fs');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 환경 변수 설정을 위한 dotenv 추가
require('dotenv').config();

// delay 함수정의
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 시작 시 2captcha API 키 확인 함수 추가
function check2CaptchaKey() {
    const captchaKey = process.env.CAPTCHA_API_KEY;
    
    if (!captchaKey) {
        console.log('\n=== 2Captcha API 키가 .env 파일에 없습니다 ===');
        return false;
    }
    
    return captchaKey;
}

// 프록시 리스트 가져오기
function getProxies() {
    try {
        const proxyFile = fs.readFileSync('/root/vana/proxy_list.js', 'utf8');  // 올바른 경로로 수정
        return proxyFile.split('\n')
            .filter(line => line.includes('\"'))
            .map(line => {
                const match = line.match(/"([^"]+)"/);
                return match ? match[1] : null;
            })
            .filter(proxy => proxy !== null);
    } catch (error) {
        console.error('프록시 파일 읽기 실패:', error);
        return [];
    }
}

// 지갑 생성 함수
async function generateWallets() {
    const proxies = getProxies();
    if (proxies.length === 0) {
        console.error('프록시 목록을 찾을 수 없습니다');
        return [];
    }

    console.log(`프록시 ${proxies.length}개 발견, 동일한 수의 지갑을 생성합니다...`);
    
    const wallets = [];
    for (let i = 0; i < proxies.length; i++) {
        const wallet = ethers.Wallet.createRandom();
        wallets.push({
            address: wallet.address,
            privateKey: wallet.privateKey
        });
    }

    // 현재 시간을 파일명에 포함
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `generated_addresses_${timestamp}.txt`;
    
    // 새로운 지갑 정보를 새 파일에 저장
    const content = wallets.map(w => 
        `주소:${w.address}\n개인키:${w.privateKey}`
    ).join('\n');
    
    fs.writeFileSync(filename, content);
    console.log(`${wallets.length}개의 지갑이 ${filename}에 저장되었습니다.`);
    
    return wallets;
}

async function processAccount(address, privateKey, proxy, index) {
    console.log(`\n계정 ${index + 1} 처리 시작...`);
    console.log(`주소: ${address}`);
    console.log(`프록시: ${proxy}`);

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            console.log('Follow 버튼 클릭 시도...');
            const followSuccess = await clickFollowButton(proxy);
            if (!followSuccess) {
                throw new Error('Follow 버튼 클릭 실패');
            }
            console.log('Follow 버튼 클릭 성공');

            console.log('Captcha 토큰 획득 시도...');
            const claimResult = await claimFaucet(address, proxy);
            
            // 성공 케이스 체크
            if (claimResult.includes('Your request is processing')) {
                console.log(`계정 ${index + 1}: ${claimResult}`);
                return true;
            }

            // 실패 케이스는 에러로 처리
            throw new Error(claimResult);

        } catch (error) {
            retryCount++;
            
            // 24시간 제한이나 2captcha 에러는 즉시 실패
            if (error.message.includes('24 hours') || 
                error.message.includes('ERROR_WRONG_USER_KEY') || 
                error.message.includes('ERROR_ZERO_BALANCE')) {
                console.log(`계정 ${index + 1} 처리 중 오류 발생: ${error.message}`);
                return false;
            }
            
            console.log(`계정 ${index + 1} 처리 중 오류 발생 (시도 ${retryCount}/${maxRetries}): ${error.message}`);
            
            if (retryCount < maxRetries) {
                console.log(`30초 후 재시도합니다...`);
                await delay(30000);
            } else {
                console.log(`최대 재시도 횟수 도달. 계정 ${index + 1} 처리 실패`);
                return false;
            }
        }
    }
    return false;
}

async function main() {
    const captchaKey = check2CaptchaKey();
    if (!captchaKey) {
        console.error('2Captcha API 키를 찾을 수 없습니다. vana.sh를 다시 실행해주세요.');
        return;
    }

    // 여기서 지갑 생성 함수 실행
    const addresses = await generateWallets();
    if (addresses.length === 0) {
        console.error('지갑 생성에 실패했습니다.');
        return;
    }

    const proxies = getProxies();
    if (proxies.length === 0) {
        console.error('프록시 정보를 찾을 수 없습니다.');
        return;
    }

    console.log(`총 ${addresses.length}개의 계정과 ${proxies.length}개의 프록시로 작업을 시작합니다.`);

    // 10개씩 배치 처리
    const BATCH_SIZE = 10;
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, Math.min(i + BATCH_SIZE, addresses.length));
        console.log(`\n${i + 1}~${i + batch.length}번 계정 처리 중...`);

        // 배치 내의 계정들을 동시에 처리
        const results = await Promise.all(
            batch.map((account, index) => 
                processAccount(
                    account.address,
                    account.privateKey,
                    proxies[i + index],
                    i + index
                )
            )
        );

        // 배치 결과 확인
        const successCount = results.filter(result => result === true).length;
        console.log(`배치 처리 완료: 성공 ${successCount}개, 실패 ${batch.length - successCount}개`);

        // 다음 배치 전 2초 대기
        if (i + BATCH_SIZE < addresses.length) {
            console.log('다음 배치 처리 전 2초 대기...');
            await delay(2000);
        }
    }

    console.log('모든 계정 처리 완료');
}

// 프로그램 실행
main().catch(console.error);

// 2captcha Turnstile 토큰을 받는 함수
const twocaptcha_turnstile = (sitekey, pageurl, proxy) => new Promise(async (resolve) => {
    const captchaKey = process.env.CAPTCHA_API_KEY;
    
    try {
        console.log('2Captcha API 요청 시작...');
        
        // 프록시 정보 파싱
        const proxyParts = proxy.split('@');
        const auth = proxyParts[0].replace('http://', '').split(':');
        const [proxyAddress, proxyPort] = proxyParts[1].split(':');
        
        const createTaskData = {
            "clientKey": captchaKey,
            "task": {
                "type": "TurnstileTask",
                "websiteURL": "https://faucet.vana.com/mainnet",
                "websiteKey": "0x4AAAAAAA2QYSDpMpFM53JQ",
                "action": "managed",
                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "proxyType": "http",
                "proxyAddress": proxyAddress,
                "proxyPort": proxyPort,
                "proxyLogin": auth[0],
                "proxyPassword": auth[1]
            }
        };

        const createResponse = await fetch('https://api.2captcha.com/createTask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createTaskData)
        });

        const createResult = await createResponse.json();
        
        if (createResult.errorId) {
            return resolve('FAILED_GETTING_TOKEN');
        }

        for (let i = 0; i < 60; i++) {
            await delay(2000);
            
            const resultResponse = await fetch('https://api.2captcha.com/getTaskResult', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "clientKey": captchaKey,
                    "taskId": createResult.taskId
                })
            });

            const resultData = await resultResponse.json();
            
            if (resultData.status === 'ready') {
                if (resultData.solution && resultData.solution.token) {
                    return resolve(resultData.solution.token);
                }
            }
        }

        resolve('FAILED_GETTING_TOKEN');
        
    } catch (error) {
        console.error('Captcha 처리 중 오류:', error);
        resolve('FAILED_GETTING_TOKEN');
    }
});

// clickFollowButton
async function clickFollowButton(proxy) {
    try {
        const proxyParts = proxy.split('@');
        const auth = proxyParts[0].replace('http://', '').split(':');
        const host = proxyParts[1];
        
        const username = auth[0];
        const password = auth[1];

        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                `--proxy-server=${host}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        await page.authenticate({
            username: username,
            password: password
        });

        console.log('페이지 로딩 시작...');
        await page.goto('https://faucet.vana.com/mainnet', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        // 페이지 로드 후 잠시 대기
        await delay(5000);
        
        console.log('버튼 찾는 중...');
        // 다양한 선택자 시도
        const buttonSelector = [
            'button.follow-button',
            'button[type="button"]',
            '.button-container button',
            'button.primary-button'
        ];

        let followButton = null;
        for (const selector of buttonSelector) {
            followButton = await page.$(selector);
            if (followButton) {
                console.log(`버튼 발견: ${selector}`);
                break;
            }
        }

        if (followButton) {
            await followButton.evaluate(b => b.click());
            console.log('Follow 버튼 클릭 성공');
            
            // 클릭 후 잠시 대기
            await delay(5000);
            
            // 새 창이 열렸는지 확인
            const pages = await browser.pages();
            if (pages.length > 1) {
                await pages[pages.length - 1].close();
            }
        } else {
            throw new Error('Follow 버튼을 찾을 수 없습니다');
        }

        await browser.close();
        return true;
        
    } catch (error) {
        console.error('Follow 버튼 클릭 중 오류 발생:', error);
        if (browser) {
            await browser.close();
        }
        return false;
    }
}

// Faucet을 청구하는 함수
const claimFaucet = (address, proxy) => new Promise(async (resolve) => {
    try {
        console.log('캡챠 토큰 요청 중...');
        const bearer = await twocaptcha_turnstile('0x4AAAAAAA2QYSDpMpFM53JQ', 'https://faucet.vana.com/mainnet', proxy);
        
        if (bearer === 'ERROR_WRONG_USER_KEY' || bearer === 'ERROR_ZERO_BALANCE' || bearer === 'FAILED_GETTING_TOKEN') {
            return resolve(bearer);
        }

        const requestBody = {
            address: address,
            captcha: bearer,
            network: "mainnet"
        };

        const res = await fetch('https://faucet.vana.com/api/transactions', {
            method: 'POST',
            headers: {
                "Content-Type": "text/plain;charset=UTF-8",
                "Origin": "https://faucet.vana.com",
                "Referer": "https://faucet.vana.com/mainnet"
            },
            body: JSON.stringify(requestBody)
        });

        const data = await res.json();
        
        if (data.status === 'pending') {
            resolve(data.message);
        } else {
            resolve(data.error || data.message);
        }
    } catch (error) {
        resolve(error.message);
    }
});

