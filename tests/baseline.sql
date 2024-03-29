-------------------------------------------------------------------
--       BASELINE SETUP FOR THE TEST SUITE DATABASE TABLES       --
-------------------------------------------------------------------
-- These queries populate the database with what the baseline    --
-- verification tests expect to find and can be used to restore  --
-- the tables to the baseline state if they ever end up out of   --
-- sync. If the expected baseline is ever updated, this file     --
-- should be updated as well to match.                           --
-------------------------------------------------------------------

-- ppl_webapp_logins_test
DELETE FROM ppl_webapp_logins_test;
-- Challengers
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('efaa0cdd1cbd165b', 'testchallenger1', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('1d568d90c11c67aa', 'testchallenger2', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('1577c386680d9554', 'testchallenger3', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('79235b4e0fec1b40', 'testchallenger4', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('8b7a46b38cf6321f', 'testchallenger5', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('c80f226aeb5ec8ae', 'testchallenger6', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('5ae3d0f7ea736bda', 'testchallenger7', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('1dac6ab4951dda90', 'testchallenger8', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('1b12a016e053a471', 'testchallenger9', 'dummyvalue', 3, 0, NULL);
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('77959f8b9e892345', 'toastchallenger', 'be49cfd69c86880bdb62b0987707a7691b9591e311a9f95482fe47a2d8da73b9:529c63a8c3f27e49da4ab5ff496fb1d9', 8, 0, NULL);
-- Leaders
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('f6266e86ce91cc9a', 'testleader1', 'dummyvalue', 1, 1, '6a9406eedec6');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('1ce00c42ae247693', 'testleader2', 'dummyvalue', 1, 1, '7729e38c3f7d');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('3ca7c8d100a73d90', 'testleader3', 'dummyvalue', 1, 1, 'bcc6f08242fb');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('87b196b9bb2b0f56', 'testleader4', 'dummyvalue', 1, 1, '7e8ab2c43c76');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('9f0d17b17d7eb579', 'testleader5', 'dummyvalue', 1, 1, '1ed127c44156');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('ab6e8db538dbc4e7', 'testleader6', 'dummyvalue', 1, 1, '74fe35c10ba6');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('654ba2f5d57964f7', 'testleader7', 'dummyvalue', 1, 1, '68e65518c4d6');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('8f94fda3fffbc3f8', 'testleader8', 'dummyvalue', 1, 1, 'd08cde9beddd');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('db7210474f9ac930', 'testleader9', 'dummyvalue', 1, 1, 'f54af38b4829');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('e52874226d329faa', 'testleader10', 'dummyvalue', 1, 1, 'dc43670ce8bc');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('a6f46197482c5736', 'testleader11', 'dummyvalue', 1, 1, '737644fef008');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('456eddef3b99773b', 'testleader12', 'dummyvalue', 1, 1, 'be9f6bfff045');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('679624b52fd68210', 'testleader13', 'dummyvalue', 1, 1, '9353f3d1262e');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('42a9d47f719c6453', 'testleader14', 'dummyvalue', 1, 1, 'd0cceeaf006a');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('9179411020732f46', 'testleader15', 'dummyvalue', 1, 1, 'b3363dd19ce8');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('7213eaafb962306a', 'testleader16', 'dummyvalue', 1, 1, '4b2fecf8bc74');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('4980f2d685b58820', 'testleader17', 'dummyvalue', 1, 1, '68ac4029d846');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('5623a572f237b72f', 'testleader18', 'dummyvalue', 1, 1, '93ff6484633d');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('9bc88996690db61f', 'testleader19', 'dummyvalue', 1, 1, '02f7564a033c');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('3a724e0203487c62', 'testleader20', 'dummyvalue', 1, 1, '15721dcb512b');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('e7143e57fd079297', 'toastleader', 'fbbd7f6ee969fc5379c4334258c2abc56fe444df8f26af6d643195acccaf16f5:8c1c86ab215118578dcfb8c622169b56', 8, 1, '8bb2ddda0a3c');
-- Elites
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('5e671436a1bbb2f8', 'testelite1', 'dummyvalue', 1, 1, 'b6857070a317');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('a27e8c82e4df6695', 'testelite2', 'dummyvalue', 1, 1, '1194829fc135');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('32eee056f68371ab', 'testelite3', 'dummyvalue', 1, 1, 'be90adcbbe2f');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('e9c242233475ab2b', 'testelite4', 'dummyvalue', 1, 1, 'bc95c2fc3f1a');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('c6a48dc6d5b35f89', 'testelite5', 'dummyvalue', 1, 1, '987597dc6aa2');
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('67e3678ac840b7ad', 'testelite6', 'dummyvalue', 1, 1, '64750eab176f');
-- Champ
INSERT INTO ppl_webapp_logins_test (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES ('594b65bb56185881', 'testchamp', 'dummyvalue', 1, 1, '5f22dc234543');

-- ppl_webapp_challengers_test
DELETE FROM ppl_webapp_challengers_test;
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('efaa0cdd1cbd165b', 'testchallenger1', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('1d568d90c11c67aa', 'testchallenger2', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('1577c386680d9554', 'testchallenger3', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('79235b4e0fec1b40', 'testchallenger4', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('8b7a46b38cf6321f', 'testchallenger5', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('c80f226aeb5ec8ae', 'testchallenger6', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('5ae3d0f7ea736bda', 'testchallenger7', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('1dac6ab4951dda90', 'testchallenger8', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('1b12a016e053a471', 'testchallenger9', '');
INSERT INTO ppl_webapp_challengers_test (id, display_name, bingo_board) VALUES ('77959f8b9e892345', 'toastchallenger', '');

-- ppl_webapp_leaders_test
DELETE FROM ppl_webapp_leaders_test;
-- Leaders
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open, twitch_handle) VALUES ('6a9406eedec6', 'Test Leader, the Testable', 7, 7, 'Test Badge', 'Test post, please ignore.', 'Also test post, also please ignore.', 0, 'testleader1');
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('7729e38c3f7d', '', 1, 2, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('bcc6f08242fb', '', 2, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('7e8ab2c43c76', '', 4, 4, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('1ed127c44156', '', 4, 2, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('74fe35c10ba6', '', 3, 3, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('68e65518c4d6', '', 5, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('d08cde9beddd', '', 7, 1, '', '', '', 1);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('f54af38b4829', '', 6, 8, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('dc43670ce8bc', '', 1, 9, '', '', '', 1);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('737644fef008', '', 1, 10, '', '', '', 1);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('be9f6bfff045', '', 2, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('9353f3d1262e', '', 1, 3, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('d0cceeaf006a', '', 4, 2, '', '', '', 1);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('b3363dd19ce8', '', 3, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('4b2fecf8bc74', '', 6, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('68ac4029d846', '', 7, 2, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('93ff6484633d', '', 4, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('02f7564a033c', '', 4, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('15721dcb512b', '', 2, 1, '', '', '', 1);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open, queue_open_text, queue_close_text, twitch_handle) VALUES ('8bb2ddda0a3c', 'Toastdeib, the Toasty Boi', 7, 3, 'Toast Badge', '', '', 0, '{name} is toasting up some trouble!', '{name} is burnt and needs a break.', 'toastdeib');
-- Elites
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open, twitch_handle) VALUES ('b6857070a317', 'Test Elite, the Testable', 8, 2, 'Test Emblem', 'Pest toast, please ignore.', 'Also pest toast, also please ignore.', 0, 'testelite1');
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('1194829fc135', '', 8, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('be90adcbbe2f', '', 8, 9, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('bc95c2fc3f1a', '', 8, 1, '', '', '', 0);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open, duo_mode) VALUES ('987597dc6aa2', '', 8, 5, '', '', '', 1, 1);
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('64750eab176f', '', 8, 1, '', '', '', 1);
-- Champ
INSERT INTO ppl_webapp_leaders_test (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES ('5f22dc234543', '', 16, 2, '', '', '', 1);

-- ppl_webapp_matches_test
DELETE FROM ppl_webapp_matches_test;
-- Test challenger records
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', 'efaa0cdd1cbd165b', 2, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 25 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('7729e38c3f7d', 'efaa0cdd1cbd165b', 1, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 24 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('bcc6f08242fb', 'efaa0cdd1cbd165b', 2, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 23 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('7e8ab2c43c76', 'efaa0cdd1cbd165b', 4, 4, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 22 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('1ed127c44156', 'efaa0cdd1cbd165b', 4, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 21 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('74fe35c10ba6', 'efaa0cdd1cbd165b', 1, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 20 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('68e65518c4d6', 'efaa0cdd1cbd165b', 4, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 19 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('d08cde9beddd', 'efaa0cdd1cbd165b', 4, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 18 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('b6857070a317', 'efaa0cdd1cbd165b', 8, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 17 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('1194829fc135', 'efaa0cdd1cbd165b', 8, 4, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 16 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('be90adcbbe2f', 'efaa0cdd1cbd165b', 8, 3, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 15 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('d0cceeaf006a', '1d568d90c11c67aa', 4, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 14 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('d0cceeaf006a', 'efaa0cdd1cbd165b', 4, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 13 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('bc95c2fc3f1a', 'efaa0cdd1cbd165b', 8, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 12 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('987597dc6aa2', 'efaa0cdd1cbd165b', 8, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 11 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('dc43670ce8bc', '79235b4e0fec1b40', 1, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 10 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('dc43670ce8bc', '8b7a46b38cf6321f', 1, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 9 SECOND));
-- Test leader records
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '1d568d90c11c67aa', 4, 2, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 8 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '1d568d90c11c67aa', 4, 4, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 7 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '1577c386680d9554', 1, 5, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 6 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '79235b4e0fec1b40', 2, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 5 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '8b7a46b38cf6321f', 4, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 4 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '1dac6ab4951dda90', 4, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 3 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', '1b12a016e053a471', 4, 0, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 2 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('6a9406eedec6', 'c80f226aeb5ec8ae', 2, 1, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 1 SECOND));
INSERT INTO ppl_webapp_matches_test (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES ('8bb2ddda0a3c', '5ae3d0f7ea736bda', 1, 2, SUBDATE(CURRENT_TIMESTAMP(), INTERVAL 0 SECOND));
