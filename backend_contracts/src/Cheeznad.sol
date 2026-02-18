// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Cheeznad {
    enum Zone {
        Pepperoni,
        Mushroom,
        Pineapple,
        Olives,
        Anchovies
    }
    
    struct ZoneInfo {
        uint256 totalDeposited;
        mapping(address => uint256) userDeposits;
        mapping(uint256 => address) indexToDepositor;
        mapping(address => bool) isDepositor;
        uint256 depositorCount;
    }
    
    mapping(Zone => ZoneInfo) public zones;
    address public oracle;
    uint256 public roundNumber;
    
    event Deposit(address indexed user, Zone indexed zone, uint256 amount);
    event Distribution(Zone indexed winningZone, uint256 totalAmount, uint256 roundNumber);
    event OracleUpdated(address indexed newOracle);
    event RoundStarted(uint256 roundNumber);
    
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call this function");
        _;
    }
    
    constructor() {
        oracle = msg.sender;
        roundNumber = 1;
        emit RoundStarted(roundNumber);
    }
    
    function deposit(Zone _zone) external payable {
        require(msg.value > 0, "Deposit must be greater than 0");
        
        ZoneInfo storage zone = zones[_zone];
        
        // Add to depositors if first deposit
        if (!zone.isDepositor[msg.sender]) {
            zone.indexToDepositor[zone.depositorCount] = msg.sender;
            zone.isDepositor[msg.sender] = true;
            zone.depositorCount++;
        }
        
        zone.userDeposits[msg.sender] += msg.value;
        zone.totalDeposited += msg.value;
        
        emit Deposit(msg.sender, _zone, msg.value);
    }
    
    function distribute(Zone _winningZone) external {
        uint256 totalFunds = address(this).balance;
        
        if (totalFunds > 0) {
            ZoneInfo storage winningZone = zones[_winningZone];
            
            if (winningZone.totalDeposited > 0) {
                // Normal distribution: winning zone has depositors
                for (uint256 i = 0; i < winningZone.depositorCount; i++) {
                    address depositor = winningZone.indexToDepositor[i];
                    uint256 userDeposit = winningZone.userDeposits[depositor];
                    
                    if (userDeposit > 0) {
                        uint256 userShare = (totalFunds * userDeposit) / winningZone.totalDeposited;

                        (bool success, ) = depositor.call{value: userShare}("");
                        require(success, "Transfer failed");
                    }
                }
            } else {
                // Refund scenario: winning zone has no depositors, return original deposits
                for (uint256 zoneId = 0; zoneId < 5; zoneId++) {
                    Zone zone = Zone(zoneId);
                    ZoneInfo storage zoneInfo = zones[zone];
                    
                    for (uint256 i = 0; i < zoneInfo.depositorCount; i++) {
                        address depositor = zoneInfo.indexToDepositor[i];
                        uint256 userDeposit = zoneInfo.userDeposits[depositor];
                        
                        if (userDeposit > 0) {
                            (bool success, ) = depositor.call{value: userDeposit}("");
                            require(success, "Refund failed");
                        }
                    }
                }
            }
        }
        
        // Reset all zones for next round
        _resetAllZones();
        
        // Start new round
        roundNumber++;
        
        emit Distribution(_winningZone, totalFunds, roundNumber);
        emit RoundStarted(roundNumber);
    }
    
    function resetRound() external {
        // Reset all zones for next round
        _resetAllZones();
        
        // Start new round
        roundNumber++;
        
        emit RoundStarted(roundNumber);
    }
    
    function _resetAllZones() private {
        for (uint256 i = 0; i < 5; i++) {
            Zone zone = Zone(i);
            ZoneInfo storage zoneInfo = zones[zone];

            for (uint256 j = 0; j < zoneInfo.depositorCount; j++) {
                address depositor = zoneInfo.indexToDepositor[j];
                delete zoneInfo.userDeposits[depositor];
                delete zoneInfo.isDepositor[depositor];
                delete zoneInfo.indexToDepositor[j];
            }
            
            zoneInfo.depositorCount = 0;
            zoneInfo.totalDeposited = 0;
        }
    }
    
    function getUserDeposit(Zone _zone, address _user) external view returns (uint256) {
        return zones[_zone].userDeposits[_user];
    }
    
    function getZoneTotal(Zone _zone) external view returns (uint256) {
        return zones[_zone].totalDeposited;
    }
    
    function getZoneDepositorCount(Zone _zone) external view returns (uint256) {
        return zones[_zone].depositorCount;
    }
    
    function getDepositorByIndex(Zone _zone, uint256 _index) external view returns (address) {
        require(_index < zones[_zone].depositorCount, "Index out of bounds");
        return zones[_zone].indexToDepositor[_index];
    }
    
    function isUserDepositor(Zone _zone, address _user) external view returns (bool) {
        return zones[_zone].isDepositor[_user];
    }
    
    function updateOracle(address _newOracle) external {
        oracle = _newOracle;
        emit OracleUpdated(_newOracle);
    }
}
