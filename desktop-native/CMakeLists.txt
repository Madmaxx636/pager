cmake_minimum_required(VERSION 3.21)
project(pager-native VERSION 0.1.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 6.4 REQUIRED COMPONENTS Core Gui Widgets Qml Quick QuickControls2 Network)
qt_standard_project_setup(REQUIRES 6.4)

# The Rust engine (built by build-core.sh) sits next to the program.
set(PAGER_CORE_DIR "${CMAKE_SOURCE_DIR}/build-core" CACHE PATH "Folder with libpager_core.so")
add_library(pager_core SHARED IMPORTED)
set_target_properties(pager_core PROPERTIES IMPORTED_LOCATION "${PAGER_CORE_DIR}/libpager_core.so")

qt_add_executable(pager-native src/main.cpp src/engine.cpp src/store.cpp src/models.cpp src/appearance.cpp src/emoji.cpp src/fileinfo.cpp)
target_include_directories(pager-native PRIVATE include src)
target_link_libraries(pager-native PRIVATE Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Qml Qt6::Quick Qt6::QuickControls2 pager_core)
set_target_properties(pager-native PROPERTIES INSTALL_RPATH "$ORIGIN:$ORIGIN/../lib" BUILD_WITH_INSTALL_RPATH ON)

qt_add_resources(pager-native icon PREFIX / FILES pager.svg emoji-names.tsv emoji-groups.tsv)
qt_add_qml_module(pager-native URI Pager VERSION 1.0 RESOURCE_PREFIX / QML_FILES
  qml/Main.qml qml/Login.qml qml/RoomList.qml qml/Chat.qml qml/Avatar.qml qml/Bubble.qml qml/Recovery.qml qml/EmojiPicker.qml qml/PollCard.qml qml/PollDialog.qml)
install(TARGETS pager-native RUNTIME DESTINATION bin)

# Tests of the parts that do not need a screen.
enable_testing()
find_package(Qt6 6.4 REQUIRED COMPONENTS Test)
qt_add_executable(store-test tests/store_test.cpp src/store.cpp)
target_include_directories(store-test PRIVATE src)
target_link_libraries(store-test PRIVATE Qt6::Core Qt6::Test)
add_test(NAME store COMMAND store-test)

# The Qt layer on top of the real engine (needs a test homeserver: see tests/engine_live_test.cpp).
qt_add_executable(engine-live-test tests/engine_live_test.cpp src/engine.cpp src/store.cpp src/models.cpp)
target_include_directories(engine-live-test PRIVATE src include)
target_link_libraries(engine-live-test PRIVATE Qt6::Core Qt6::Test pager_core)
set_target_properties(engine-live-test PROPERTIES INSTALL_RPATH "$ORIGIN" BUILD_WITH_INSTALL_RPATH ON)
add_test(NAME engine-live COMMAND engine-live-test)

qt_add_executable(emoji-test tests/emoji_test.cpp src/emoji.cpp)
target_include_directories(emoji-test PRIVATE src)
target_link_libraries(emoji-test PRIVATE Qt6::Core Qt6::Test)
add_test(NAME emoji COMMAND emoji-test)
