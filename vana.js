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

    // 생성된 지갑 정보 저장
    const content = wallets.map(w => 
        `주소:${w.address}\n개인키:${w.privateKey}`
    ).join('\n');
    
    fs.writeFileSync('generated_addresses.txt', content);
    console.log(`${wallets.length}개의 지갑이 생성되어 저장되었습니다.`);
    
    return wallets;
}

async function processAccount(address, privateKey, proxy, index) {
    console.log(`\n계정 ${index + 1} 처리 시작...`);
    console.log(`주소: ${address}`);
    console.log(`프록시: ${proxy}`);

    try {
        // Follow 버튼 클릭
        console.log('Follow 버튼 클릭 시도...');
        const followSuccess = await clickFollowButton(proxy);
        if (!followSuccess) {
            throw new Error('Follow 버튼 클릭 실패');
        }
        console.log('Follow 버튼 클릭 성공');

        // Captcha 토큰 획득
        console.log('Captcha 토큰 획득 시도...');
        const captchaToken = await twocaptcha_turnstile('0x4AAAAAAADnHQBlrqABLwx', 'https://faucet.vana.com/mainnet');
        if (captchaToken === 'ERROR_WRONG_USER_KEY' || captchaToken === 'ERROR_ZERO_BALANCE' || captchaToken === 'FAILED_GETTING_TOKEN') {
            throw new Error(`Captcha 토큰 획득 실패: ${captchaToken}`);
        }
        console.log('Captcha 토큰 획득 성공');

        // Faucet 청구
        console.log('Faucet 청구 시도...');
        const claimResult = await claimFaucet(address, captchaToken, proxy);
        console.log(`Faucet 청구 결과: ${claimResult}`);

        return true;
    } catch (error) {
        console.error(`계정 ${index + 1} 처리 중 오류 발생:`, error.message);
        return false;
    }
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

    for (let i = 0; i < addresses.length; i++) {
        const success = await processAccount(
            addresses[i].address,
            addresses[i].privateKey,
            proxies[i],
            i
        );

        if (success) {
            console.log(`계정 ${i + 1} 처리 완료`);
        } else {
            console.log(`계정 ${i + 1} 처리 실패`);
        }

        // 다음 계정 처리 전 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('모든 계정 처리 완료');
}

// 프로그램 실행
main().catch(console.error);

// 2captcha Turnstile 토큰을 받는 함수
const twocaptcha_turnstile = (sitekey, pageurl) => new Promise(async (resolve) => {
    const captchaKey = process.env.CAPTCHA_API_KEY;
    try {
        const getToken = await fetch(`https://2captcha.com/in.php?key=${captchaKey}&method=turnstile&sitekey=${sitekey}&pageurl=${pageurl}&json=1`, {
            method: 'GET',
        })
        .then(res => res.text())
        .then(res => {
            if (res == 'ERROR_WRONG_USER_KEY' || res == 'ERROR_ZERO_BALANCE') {
                return resolve(res);
            } else {
                return res.split('|');
            }
        });

        if (getToken[0] != 'OK') {
            resolve('FAILED_GETTING_TOKEN');
        }
    
        const task = getToken[1];

        for (let i = 0; i < 60; i++) {
            const token = await fetch(
                `https://2captcha.com/res.php?key=${captchaKey}&action=get&id=${task}&json=1`
            ).then(res => res.json());
            
            if (token.status == 1) {
                resolve(token.request);
                break;
            }
            await delay(5);
        }
    } catch (error) {
        resolve('FAILED_GETTING_TOKEN');
    }
});

// clickFollowButton
async function clickFollowButton(proxy) {
    try {
        // 프록시 URL에서 인증 정보 추출
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
        
        // 프록시 인증 설정
        await page.authenticate({
            username: username,
            password: password
        });
        
        await page.goto('https://faucet.vana.com/mainnet', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        await page.waitForSelector('button[data-testid="follow-button"]', { timeout: 10000 });
        await page.click('button[data-testid="follow-button"]');
        
        await delay(2000);
        await browser.close();
        
        return true;
    } catch (error) {
        console.error('Follow 버튼 클릭 중 오류 발생:', error);
        return false;
    }
}

// Faucet을 청구하는 함수
const claimFaucet = (address) => new Promise(async (resolve) => {
    let success = false;
    
    // Follow 버튼 클릭 먼저 실행
    const followSuccess = await clickFollowButton();
    if (!followSuccess) {
        resolve('Follow 버튼 클릭 실패');
        return;
    }
    
    while (!success) {
        const bearer = await twocaptcha_turnstile('0x4AAAAAAADnHQBlrqABLwx', 'https://faucet.vana.com/mainnet');
        if (bearer == 'ERROR_WRONG_USER_KEY' || bearer == 'ERROR_ZERO_BALANCE' || bearer == 'FAILED_GETTING_TOKEN' ) {
            success = true;
            resolve(`클레임 실패, ${bearer}`);
        }
    
        try {
            const res = await fetch('https://faucet.vana.com/api/transactions', {
                method: 'POST',
                headers: {
                    "Accept": "*/*",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Content-Type": "text/plain;charset=UTF-8",
                    "Origin": "https://faucet.vana.com",
                    "Priority": "u=1, i",
                    "Referer": "https://faucet.vana.com/mainnet",
                    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": "Windows",
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                },
                body: JSON.stringify({
                    address: address,
                    captchaToken: bearer.request
                })
            });

            const data = await res.json();
            
            if (res.ok && (data.status === 'success' || data.success)) {
                success = true;
                resolve(`성공적으로 토큰을 클레임했습니다!`);
            } else {
                throw new Error(data.message || '클레임 실패');
            }
        } catch (error) {
            console.error('클레임 중 오류 발생:', error);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 실패시 1초 대기
        }
    }
});
