// let wallet;
let provider;
let signer;

// 初始化 Provider
async function initProvider() {
    if (typeof window.ethereum === 'undefined') {
        alert("请安装 MetaMask");
        return false;
    }

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();

        // 获取当前网络
        const network = await provider.getNetwork();
        console.log("✅ 当前网络 Chain ID:", network.chainId);

        // 更新页面显示
        updateNetworkInfo();
        updateBalance();

        return true;
    } catch (error) {
        console.error("初始化 Provider 失败:", error);
        return false;
    }
}

// 连接钱包
async function connectMetaMask() {
    if (typeof window.ethereum === 'undefined') {
        alert('请安装 MetaMask！');
        return;
    }

    // 尝试自动切换到 Sepolia
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }] // 11155111 的十六进制
        });
        await initProvider();
    } catch (switchError) {
        // 用户需要手动添加网络
        if (switchError.code === 4902) {
            alert('请手动添加 Sepolia 网络到 MetaMask');
        }
    }

    try {
        // 请求账户
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // 初始化 Provider
        await initProvider();

        // ✅ 监听账户切换
        window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length === 0) {
                signer = null;
                document.getElementById('walletAddress').innerText = '未连接钱包';
            } else {
                await initProvider();
            }
        });

        // ✅ 监听网络切换（关键！）
        window.ethereum.on('chainChanged', async (chainId) => {
            console.log("监听页面网络切换，新 Chain ID:", chainId);
            await initProvider(); // 重新初始化！
        });

    } catch (error) {
        if (error.code === 4001) {
            setStatus('❌ 用户拒绝了连接请求');
        } else {
            alert('连接失败: ' + error.message);
        }
    }
}

// 更新网络信息显示
async function updateNetworkInfo() {
    if (!provider) return;

    try {
        const network = await provider.getNetwork();
        let networkName;
        switch (network.chainId) {
            case 1:
                networkName = "Ethereum Mainnet";
                break;
            case 11155111:
                networkName = "Sepolia Testnet";
                break;
            case 5:
                networkName = "Goerli Testnet";
                break;
            default:
                networkName = "未知网络 (Chain ID: " + network.chainId + ")";
        }
        document.getElementById('networkInfo').innerText = '🌐 当前网络: ' + networkName;
    } catch (error) {
        console.error("获取网络信息失败:", error);
    }
}

function disconnect() {
    signer = null;
    document.getElementById('walletAddress').innerText = '未连接钱包';
    setStatus('已断开连接');
}

/* abandoned
// 更新余额
async function updateBalance() {
    if (!wallet) return;
    try {
        const balance = await wallet.getBalance();
        document.getElementById('walletAddress').innerText += ' | 余额: ' + ethers.utils.formatEther(balance) + ' ETH';
    } catch (error) {
        console.error('获取余额失败:', error);
    }
}
*/

async function updateBalance() {
    if (!signer) return;
    try {
        const balance = await signer.getBalance();
        const address = await signer.getAddress();
        document.getElementById('walletAddress').innerText = 
            '已连接: ' + address + ' | 余额: ' + ethers.utils.formatEther(balance) + ' ETH';
    } catch (error) {
        console.error('获取余额失败:', error);
    }
}


// ETH 转账
async function transferETH() {
    await handleTransaction(async () => {
        const toAddress = document.getElementById('ethTo').value.trim();
        const amountStr = document.getElementById('ethAmount').value.trim();

        if (!ethers.utils.isAddress(toAddress)) throw new Error('接收地址无效');
        if (isNaN(amountStr) || parseFloat(amountStr) <= 0) throw new Error('金额无效');

        const amount = ethers.utils.parseEther(amountStr);
        const tx = await signer.sendTransaction({
            to: toAddress,
            value: amount
        });
        return tx;
    }, 'ETH 转账');
}


// ERC20 ABI（简化版）
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",      
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)", 
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];


// ERC721 ABI（简化版）
const ERC721_ABI = [
    "function safeTransferFrom(address from, address to, uint tokenId)",
    "function ownerOf(uint tokenId) view returns (address)"
];


// ERC20 转账
async function transferERC20() {
    if (!signer) { // ✅ 防御性检查
        throw new Error('请先连接钱包！');
    }

    await handleTransaction(async () => {
        const contractAddress = document.getElementById('erc20Address').value.trim();
        const toAddress = document.getElementById('erc20To').value.trim();
        const amountStr = document.getElementById('erc20Amount').value.trim();

        if (!ethers.utils.isAddress(contractAddress)) throw new Error('合约地址无效');
        if (!ethers.utils.isAddress(toAddress)) throw new Error('接收地址无效');
        if (isNaN(amountStr) || parseFloat(amountStr) <= 0) throw new Error('金额无效');

        // ✅ 检查网络
        const network = await provider.getNetwork();
        if (network.chainId !== 11155111) {
            throw new Error('请切换到 Sepolia 网络！');
        }

        const contract = new ethers.Contract(contractAddress, ERC20_ABI, signer); // ✅ 用 signer
        const decimals = await contract.decimals();
        const amount = ethers.utils.parseUnits(amountStr, decimals);

        const tx = await contract.transfer(toAddress, amount);
        return tx;
    }, 'ERC20 转账');
}


// ERC20 授权
async function approveERC20() {
    if (!signer) { // ✅ 防御性检查
        throw new Error('请先连接钱包！');
    }

    await handleTransaction(async () => {
        const contractAddress = document.getElementById('erc20Address').value.trim();
        const spender = document.getElementById('erc20To').value.trim(); // 授权目标
        const amountStr = document.getElementById('erc20Amount').value.trim();

        if (!ethers.utils.isAddress(contractAddress)) throw new Error('合约地址无效');
        if (!ethers.utils.isAddress(spender)) throw new Error('授权地址无效');
        if (isNaN(amountStr) || parseFloat(amountStr) <= 0) throw new Error('金额无效');

        const contract = new ethers.Contract(contractAddress, ERC20_ABI, signer); // ✅ 必须用 signer！
        const decimals = await contract.decimals();
        const amount = ethers.utils.parseUnits(amountStr, decimals);

        const tx = await contract.approve(spender, amount);
        return tx;
    }, 'ERC20 授权');
}

// ERC721 转账
async function transferERC721() {
    await handleTransaction(async () => {
        const contractAddress = document.getElementById('erc721Address').value.trim();
        const toAddress = document.getElementById('erc721To').value.trim();
        const tokenId = document.getElementById('erc721TokenId').value.trim();

        if (!ethers.utils.isAddress(contractAddress)) throw new Error('ERC721 合约地址无效');
        if (!ethers.utils.isAddress(toAddress)) throw new Error('接收地址无效');
        if (isNaN(tokenId) || parseInt(tokenId) < 0) throw new Error('Token ID 无效');

        const contract = new ethers.Contract(contractAddress, ERC721_ABI, signer);

        // 检查 tokenId 是否存在（可选）
        try {
            const owner = await contract.ownerOf(tokenId);
            if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
                throw new Error('你不是这个 NFT 的所有者');
            }
        } catch (error) {
            throw new Error('Token ID 不存在或你不是所有者');
        }

        const tx = await contract.safeTransferFrom(wallet.address, toAddress, tokenId);
        return tx;
    }, 'ERC721 转账');
}

// 统一交易处理函数
async function handleTransaction(txFunction, actionName) {
    try {
        setStatus(`⏳ ${actionName}中...`);

        const tx = await txFunction();
        setStatus(`✅ 交易已发送！哈希: ${tx.hash}`);

        // 等待 1 个区块确认
        await tx.wait(1);
        setStatus(`🎉 ${actionName}成功！交易: https://sepolia.etherscan.io/tx/${tx.hash}`);

    } catch (error) {
        if (error.code === 'ACTION_REJECTED') {
            setStatus(`❌ 用户取消了 ${actionName}`);
        } else {
            setStatus(`❌ ${actionName}失败: ${error.message}`);
        }
    }
}

// 设置状态
function setStatus(message) {
    document.getElementById('txStatus').innerText = message;
}
