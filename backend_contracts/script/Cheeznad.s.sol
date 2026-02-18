// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Cheeznad} from "../src/Cheeznad.sol";

contract CheeznadScript is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        address oracle = msg.sender;
        
        Cheeznad cheeznad = new Cheeznad();
        
        console.log("Cheeznad deployed at:", address(cheeznad));
        console.log("Oracle set to:", oracle);
        
        vm.stopBroadcast();
    }
}