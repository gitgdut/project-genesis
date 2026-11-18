// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// One shared construction board. Demo allowances are not tokens or money.
/// Newly authored for GENESIS; no third-party game contract is incorporated.
contract GenesisCommunity {
    uint8[81] public kinds;
    uint8[81] public rotations;
    address[81] public builders;
    mapping(address => bool) public joined;
    mapping(address => uint256) public allowance;
    uint256 public revision;
    uint256 public participants;
    event Joined(address indexed player);
    event Built(address indexed player, uint8 indexed cell, uint8 kind, uint8 rotation, uint256 revision);
    event Dismantled(address indexed player, uint8 indexed cell, uint256 revision);

    constructor() { kinds[40] = 8; }

    function cost(uint8 kind) public pure returns (uint256) {
        require(kind >= 1 && kind <= 7, "kind");
        if (kind == 1) return 1;
        if (kind == 2) return 5;
        if (kind == 7) return 6;
        return 3;
    }

    function valid(uint8 cell) public pure returns (bool) {
        if (cell >= 81) return false;
        int256 x = int256(uint256(cell % 9)) - 4;
        int256 z = int256(uint256(cell / 9)) - 4;
        return x*x + z*z <= 21;
    }

    function adjacent(uint8 cell) internal view returns (bool) {
        return (cell % 9 > 0 && kinds[cell-1] != 0)
            || (cell % 9 < 8 && kinds[cell+1] != 0)
            || (cell >= 9 && kinds[cell-9] != 0)
            || (cell < 72 && kinds[cell+9] != 0);
    }

    function build(uint8 cell, uint8 kind, uint8 rotation) external {
        uint256 price = cost(kind);
        require(valid(cell) && rotation < 4, "placement");
        require(kinds[cell] == 0, "occupied");
        require(adjacent(cell), "isolated");
        if (!joined[msg.sender]) {
            joined[msg.sender] = true;
            allowance[msg.sender] = 12;
            participants++;
            emit Joined(msg.sender);
        }
        require(allowance[msg.sender] >= price, "allowance");
        allowance[msg.sender] -= price;
        kinds[cell] = kind;
        rotations[cell] = rotation;
        builders[cell] = msg.sender;
        emit Built(msg.sender, cell, kind, rotation, ++revision);
    }

    function dismantle(uint8 cell) external {
        require(valid(cell) && cell != 40, "placement");
        require(builders[cell] == msg.sender && kinds[cell] != 0, "builder");
        allowance[msg.sender] += cost(kinds[cell]);
        delete kinds[cell]; delete rotations[cell]; delete builders[cell];
        emit Dismantled(msg.sender, cell, ++revision);
    }

    function board() external view returns (uint8[81] memory, uint8[81] memory, address[81] memory) {
        return (kinds, rotations, builders);
    }
}
