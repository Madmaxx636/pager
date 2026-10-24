import QtQuick
import QtTest
import "../qml"
Item { width: 900; height: 700
  Tour { id: tour }
  TestCase { name: "Tour"; when: windowShown
    function test_the_tour_steps_through_and_finishes() {
      tour.start(); wait(100); verify(tour.visible); compare(tour.i, 0)
      tour.typed = 1e9; for (let k = 0; k < 10 && !tour.last; ++k) tour.i++
      verify(tour.last); tour.finish(); wait(50); verify(!tour.visible)
    } } }
