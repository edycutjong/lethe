// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LetheStakingRegistry
 * @dev Governs agent staking, SLA monitoring, slashing rules, and x402 micro-payment challenge verification.
 */
contract LetheStakingRegistry {
    
    struct Job {
        address user;
        address agent;
        uint256 fee;
        uint256 expiration;
        bytes32 commitmentHash; // PoseidonHash(PII_hash || salt)
        bool completed;
        bool slashed;
    }

    // USDC Stablecoin mock address
    address public immutable usdcToken;
    
    // Slashing parameters
    uint256 public constant AGENT_STAKE_REQUIRED = 500 * 10**6; // $500.00 USDC (6 decimals)
    uint256 public constant SLA_WINDOW = 72 hours;
    uint256 public constant SLASH_AMOUNT = 50 * 10**6; // $50.00 USDC compensation to user
    uint256 public constant X402_FEE_PER_BROKER = 50000; // $0.05 USDC per broker deletion challenge

    // State Variables
    mapping(bytes32 => Job) public jobs;
    mapping(address => uint256) public agentCollateral;
    mapping(bytes32 => bool) public verifiedPayments; // ChallengeHash -> Paid

    // Events
    event AgentRegistered(address indexed agent, uint256 collateral);
    event JobCreated(bytes32 indexed jobId, address indexed user, address indexed agent, bytes32 commitmentHash, uint256 expiration);
    event JobCompleted(bytes32 indexed jobId);
    event AgentSlashed(bytes32 indexed jobId, address indexed agent, address indexed user, uint256 amount);
    event ChallengePaid(bytes32 indexed challengeHash, address indexed user, uint256 amount);

    constructor(address _usdcToken) {
        usdcToken = _usdcToken;
    }

    /**
     * @dev Register an agent by depositing $500 USDC collateral.
     */
    function registerAgent() external {
        // In a real implementation, we would transfer USDC from the caller
        // IERC20(usdcToken).transferFrom(msg.sender, address(this), AGENT_STAKE_REQUIRED);
        agentCollateral[msg.sender] += AGENT_STAKE_REQUIRED;
        emit AgentRegistered(msg.sender, agentCollateral[msg.sender]);
    }

    /**
     * @dev Pay the x402 micropayment fee for a specific broker challenge.
     * @param challengeHash The hash representing Keccak256(Broker_i || Job_id || nonce)
     */
    function payChallengeFee(bytes32 challengeHash) external payable {
        // In a real implementation, we transfer USDC
        // IERC20(usdcToken).transferFrom(msg.sender, address(this), X402_FEE_PER_BROKER);
        verifiedPayments[challengeHash] = true;
        emit ChallengePaid(challengeHash, msg.sender, X402_FEE_PER_BROKER);
    }

    /**
     * @dev Create an erasure campaign job.
     */
    function createJob(
        bytes32 jobId,
        address agent,
        bytes32 commitmentHash,
        uint256 numBrokers
    ) external {
        require(agentCollateral[agent] >= AGENT_STAKE_REQUIRED, "Agent has insufficient staked collateral");
        
        uint256 totalFee = numBrokers * X402_FEE_PER_BROKER;
        
        jobs[jobId] = Job({
            user: msg.sender,
            agent: agent,
            fee: totalFee,
            expiration: block.timestamp + SLA_WINDOW,
            commitmentHash: commitmentHash,
            completed: false,
            slashed: false
        });

        emit JobCreated(jobId, msg.sender, agent, commitmentHash, block.timestamp + SLA_WINDOW);
    }

    /**
     * @dev Complete a job upon providing valid signed proof VCs.
     */
    function completeJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.agent || msg.sender == address(this), "Only the assigned agent can complete the job");
        require(!job.completed, "Job already completed");
        require(!job.slashed, "Job already slashed");

        job.completed = true;
        emit JobCompleted(jobId);
        
        // Return x402 fees to the agent as reward
        // IERC20(usdcToken).transfer(job.agent, job.fee);
    }

    /**
     * @dev Challenge an agent's SLA compliance. If expired, slashes agent collateral.
     */
    function challengeSLA(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(!job.completed, "Job already completed");
        require(!job.slashed, "Job already slashed");
        require(block.timestamp > job.expiration, "SLA timeline has not yet expired");

        job.slashed = true;
        
        // Slash agent collateral
        require(agentCollateral[job.agent] >= SLASH_AMOUNT, "Agent collateral is depleted");
        agentCollateral[job.agent] -= SLASH_AMOUNT;
        
        // Pay out compensation to the user
        // IERC20(usdcToken).transfer(job.user, SLASH_AMOUNT);

        emit AgentSlashed(jobId, job.agent, job.user, SLASH_AMOUNT);
    }

    /**
     * @dev Helper to query payment verification status. Called by TEE Enclave.
     */
    function isChallengePaid(bytes32 challengeHash) external view returns (bool) {
        return verifiedPayments[challengeHash];
    }
}
