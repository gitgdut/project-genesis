// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../GenesisCommunity.sol";
interface CommunityVm { function prank(address) external; }
contract CommunityTest {
    CommunityVm constant vm = CommunityVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ALICE = address(1);
    address constant BOB = address(2);
    function testThreePeopleBuildOneBoard() public {
        GenesisCommunity c = new GenesisCommunity();
        vm.prank(ALICE); c.build(41,2,0);
        vm.prank(BOB); c.build(50,3,1);
        vm.prank(address(3)); c.build(49,4,0);
        require(c.participants() == 3 && c.revision() == 3);
        require(c.builders(41) == ALICE && c.builders(50) == BOB);
        require(c.allowance(ALICE) == 7 && c.allowance(BOB) == 9);
    }
    function testOccupiedTileRaceHasOneWinner() public {
        GenesisCommunity c = new GenesisCommunity();
        vm.prank(ALICE); c.build(41,2,0);
        vm.prank(BOB); (bool ok,) = address(c).call(abi.encodeCall(c.build,(41,3,0)));
        require(!ok && !c.joined(BOB) && c.participants() == 1);
        require(c.builders(41) == ALICE && c.revision() == 1);
    }
    function testOnlyBuilderCanDismantle() public {
        GenesisCommunity c = new GenesisCommunity();
        vm.prank(ALICE); c.build(41,2,0);
        vm.prank(BOB); (bool ok,) = address(c).call(abi.encodeCall(c.dismantle,(41)));
        require(!ok && c.kinds(41) == 2);
        vm.prank(ALICE); c.dismantle(41);
        require(c.kinds(41) == 0 && c.allowance(ALICE) == 12);
        vm.prank(ALICE); (bool twice,) = address(c).call(abi.encodeCall(c.dismantle,(41)));
        require(!twice && c.allowance(ALICE) == 12);
    }
    function testCannotClaimTwiceAndOverspend() public {
        GenesisCommunity c = new GenesisCommunity();
        vm.prank(ALICE); c.build(41,7,0);
        vm.prank(ALICE); c.build(42,7,0);
        vm.prank(ALICE); (bool ok,) = address(c).call(abi.encodeCall(c.build,(43,1,0)));
        require(!ok && c.allowance(ALICE) == 0 && c.participants() == 1);
    }
    function testInvalidTilesAndCoreAreProtected() public {
        GenesisCommunity c = new GenesisCommunity();
        uint8[4] memory bad = [uint8(0),80,81,255];
        for (uint256 i; i < 4; i++) {
            (bool ok,) = address(c).call(abi.encodeCall(c.build,(bad[i],1,0)));
            require(!ok);
        }
        (bool core,) = address(c).call(abi.encodeCall(c.dismantle,(40))); require(!core);
        (bool isolated,) = address(c).call(abi.encodeCall(c.build,(4,1,0))); require(!isolated);
        (bool rotation,) = address(c).call(abi.encodeCall(c.build,(41,1,4))); require(!rotation);
    }
    function testFuzzRefundConservesAllowance(uint8 kind, uint8 rotation) public {
        kind = uint8(uint256(kind)%7+1); rotation %= 4;
        GenesisCommunity c = new GenesisCommunity();
        vm.prank(ALICE); c.build(41,kind,rotation);
        require(c.allowance(ALICE) + c.cost(kind) == 12);
        vm.prank(ALICE); c.dismantle(41);
        require(c.allowance(ALICE) == 12 && c.kinds(41) == 0);
    }
}
